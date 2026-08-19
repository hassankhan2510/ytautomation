/**
 * PLAYBOOK LLM SCHEDULER — a (key × model) budget matrix over Groq's free tier.
 *
 * Groq free tier limits are PER MODEL, PER KEY:
 *   - ~30 requests / minute      (RPM)
 *   - ~1,000 requests / day      (RPD, resets at UTC midnight)
 *   - ~8,000 tokens / minute     (TPM, input + output both count)
 *
 * With 3 keys × 3 models you have 9 independent budget "slots". This scheduler:
 *   1. Picks the best slot for a task's QUALITY TIER (high tasks -> gpt-oss-120b; cheap tasks -> 20b),
 *      choosing the slot with the most headroom that satisfies RPM + RPD + TPM right now.
 *   2. Clamps max_tokens so (input + output) always fits one slot's TPM -> no 413.
 *   3. On 429 marks that slot spent for the minute and instantly rotates to another slot.
 *   4. Persists the DAILY (RPD) counters to disk, so a resumed 2-hour run never blows the 1K/day cap.
 *   5. Never silently downgrades quality: a "high" task waits for a high-tier slot; it only drops a tier
 *      if every high-tier slot is exhausted FOR THE DAY (then it logs the downgrade loudly).
 *
 * Keys:   GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3   (or GROQ_API_KEYS="k1,k2,k3")
 * Models: PB_MODELS='[{"id":"openai/gpt-oss-120b","tier":"high","tpm":8000,"rpm":30,"rpd":1000}, ...]'
 *         (a sane default pool is used if PB_MODELS is unset)
 *
 * CLI:  node src/pb_llm.mjs --doctor      # print slots + do a tiny live ping if keys are set
 */

import fs from "node:fs";

const API = "https://api.groq.com/openai/v1/chat/completions";

/* ---------- config ---------- */
const DEFAULT_MODELS = [
  { id: "openai/gpt-oss-120b", tier: "high", tpm: 8000, rpm: 30, rpd: 1000 },
  { id: "qwen/qwen3-32b",      tier: "mid",  tpm: 6000, rpm: 30, rpd: 1000 },
  { id: "openai/gpt-oss-20b",  tier: "fast", tpm: 8000, rpm: 30, rpd: 1000 },
];
const TIER_RANK = { fast: 1, mid: 2, high: 3 };

function loadModels() {
  if (process.env.PB_MODELS) {
    try {
      const arr = JSON.parse(process.env.PB_MODELS);
      if (Array.isArray(arr) && arr.length) return arr.map((m) => ({ tier: "mid", tpm: 8000, rpm: 30, rpd: 1000, ...m }));
    } catch { console.log("  ! PB_MODELS is not valid JSON — using default model pool"); }
  }
  return DEFAULT_MODELS;
}
function loadKeys() {
  const keys = [
    ...(process.env.GROQ_API_KEYS ? process.env.GROQ_API_KEYS.split(",") : []),
    process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
  ].map((s) => (s || "").trim()).filter(Boolean);
  return [...new Set(keys)];
}

const MODELS = loadModels();
const KEYS = loadKeys();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const est = (s) => Math.ceil(((s || "").length + 3) / 3.6); // ~ chars/token, slight over-estimate
const utcDay = () => new Date().toISOString().slice(0, 10);

/* ---------- slot state: one per (key, model) ---------- */
// rolling 60s TPM + RPM windows live in memory; RPD lives on disk (survives resume/restart).
const slots = [];
for (let k = 0; k < KEYS.length; k++) {
  for (let m = 0; m < MODELS.length; m++) {
    slots.push({
      key: KEYS[k], keyIdx: k, model: MODELS[m],
      tpmStart: 0, tpmUsed: 0,          // rolling 60s tokens
      rpmStart: 0, rpmCount: 0,         // rolling 60s requests
      rpdDay: utcDay(), rpdCount: 0,    // per-UTC-day requests (persisted)
      cooldownUntil: 0,                 // set on 429 for this slot
    });
  }
}

/* ---------- disk persistence for the daily (RPD) counters ---------- */
let BUDGET_FILE = process.env.PB_BUDGET_FILE || "";
export function setBudgetFile(p) { BUDGET_FILE = p; loadBudget(); }
function loadBudget() {
  if (!BUDGET_FILE || !fs.existsSync(BUDGET_FILE)) return;
  try {
    const d = JSON.parse(fs.readFileSync(BUDGET_FILE, "utf-8"));
    const today = utcDay();
    for (const s of slots) {
      const rec = d[`${s.keyIdx}:${s.model.id}`];
      if (rec && rec.day === today) { s.rpdDay = today; s.rpdCount = rec.count || 0; }
    }
  } catch { /* corrupt budget file -> start fresh (safe) */ }
}
function saveBudget() {
  if (!BUDGET_FILE) return;
  const out = {};
  for (const s of slots) out[`${s.keyIdx}:${s.model.id}`] = { day: s.rpdDay, count: s.rpdCount };
  try { fs.writeFileSync(BUDGET_FILE, JSON.stringify(out, null, 2)); } catch { /* non-fatal */ }
}

/* ---------- window bookkeeping ---------- */
function refresh(s, now) {
  if (now - s.tpmStart >= 60000) { s.tpmStart = now; s.tpmUsed = 0; }
  if (now - s.rpmStart >= 60000) { s.rpmStart = now; s.rpmCount = 0; }
  if (s.rpdDay !== utcDay()) { s.rpdDay = utcDay(); s.rpdCount = 0; }
}
function budgetOf(model) { return Math.floor(model.tpm * 0.9); } // 10% headroom for estimate error

// Can this slot take a request costing `cost` tokens right now?
function slotFree(s, cost, now) {
  if (now < s.cooldownUntil) return false;
  if (s.rpdCount >= s.model.rpd) return false;               // daily cap (hard)
  if (s.rpmCount >= s.model.rpm) return false;               // per-minute request cap
  const budget = budgetOf(s.model);
  const free = budget - s.tpmUsed;
  return s.tpmUsed === 0 || cost <= free;                    // TPM room (empty window always ok)
}

/**
 * Reserve the best slot for a task. `floorRank` = minimum acceptable tier rank.
 * Prefers the HIGHEST tier available (best quality), then the most TPM headroom.
 * Returns { slot } or waits. If the whole floor tier is exhausted for the DAY, drops one tier (loud).
 */
async function reserve(cost, floorRank) {
  for (let spins = 0; ; spins++) {
    const now = Date.now();
    for (const s of slots) refresh(s, now);

    // candidates at or above the floor, grouped by tier rank (prefer higher tier)
    let best = null, bestRank = -1, bestFree = -1, soonest = 60000;
    let dayLiveAtFloor = false; // is any floor-tier slot still under its daily cap?
    for (const s of slots) {
      const rank = TIER_RANK[s.model.tier] || 1;
      if (rank >= floorRank && s.rpdCount < s.model.rpd) dayLiveAtFloor = true;
      if (rank < floorRank) continue;
      if (slotFree(s, cost, now)) {
        const free = budgetOf(s.model) - s.tpmUsed;
        if (rank > bestRank || (rank === bestRank && free > bestFree)) { best = s; bestRank = rank; bestFree = free; }
      } else if (now >= s.cooldownUntil) {
        soonest = Math.min(soonest, 60000 - (now - s.tpmStart), 60000 - (now - s.rpmStart));
      } else {
        soonest = Math.min(soonest, s.cooldownUntil - now);
      }
    }
    if (best) { best.tpmUsed += cost; best.rpmCount += 1; best.rpdCount += 1; saveBudget(); return best; }

    // Everything at/above the floor is momentarily busy. If the floor tier is DONE for the day, downgrade.
    if (!dayLiveAtFloor && floorRank > 1) {
      console.log(`  ⚠ every tier>=${floorRank} slot is out of DAILY budget — dropping to tier ${floorRank - 1} to keep the run alive`);
      return reserve(cost, floorRank - 1);
    }
    const wait = Math.max(500, Math.min(soonest + 300, 61000));
    if (spins === 0 || spins % 10 === 0) console.log(`  … LLM budget guard: all usable slots busy — pausing ${Math.ceil(wait / 1000)}s`);
    await sleep(wait);
  }
}
function markCooldown(s, ms) { s.cooldownUntil = Date.now() + ms; }

function parseRetryMs(body) { const m = /try again in ([\d.]+)\s*s/i.exec(body || ""); return m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : null; }
function parseJSON(txt) { try { return JSON.parse(txt); } catch { const m = (txt || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } } }

/**
 * Core call. Returns { content, model } or null.
 * opts: { tier:'high'|'mid'|'fast', maxTokens, temperature, json:true }
 */
async function call(system, user, opts = {}) {
  if (!KEYS.length) { console.log("  ! No GROQ_API_KEY set — caller must fall back"); return null; }
  const floorRank = TIER_RANK[opts.tier || "high"] || 3;
  const temperature = opts.temperature ?? 0.5;
  const json = opts.json !== false;
  const inputEst = est(system) + est(user);

  for (let attempt = 1; attempt <= 6; attempt++) {
    // cost is estimated against the smallest-TPM model so any reserved slot fits; clamp per chosen slot after.
    const wantOut = opts.maxTokens ?? 1400;
    const slot = await reserve(inputEst + wantOut, floorRank);
    const budget = budgetOf(slot.model);
    let cap = Math.max(256, Math.min(wantOut, budget - inputEst - 200));
    try {
      const payload = { model: slot.model.id, temperature, max_tokens: cap, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
      if (json) payload.response_format = { type: "json_object" };
      const res = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${slot.key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (res.status === 413) { const b = await res.text().catch(() => ""); console.log(`  ! 413 too-large on ${slot.model.id} — ${b.slice(0, 90)}`); continue; }
      if (res.status === 429) {
        const b = await res.text().catch(() => "");
        markCooldown(slot, parseRetryMs(b) ?? 12000);
        console.log(`  ! 429 on ${slot.model.id} key#${slot.keyIdx + 1} — cooling that slot, rotating (attempt ${attempt}/6)`);
        continue;
      }
      if (res.status >= 500) { console.log(`  ! ${res.status} on ${slot.model.id} — retrying (${attempt}/6)`); await sleep(1500 * attempt); continue; }
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);

      const d = await res.json();
      const used = d?.usage?.total_tokens;
      if (used) slot.tpmUsed += Math.max(0, used - (inputEst + cap)); // reconcile estimate vs actual
      const content = d.choices?.[0]?.message?.content || "";
      if (!content.trim()) throw new Error("empty completion");
      return { content, model: slot.model.id, keyIdx: slot.keyIdx };
    } catch (e) {
      console.log(`  ! LLM attempt ${attempt}/6 failed on ${slot.model.id}: ${e.message}`);
      if (attempt < 6) await sleep(800 * attempt);
    }
  }
  console.log("  ! LLM unavailable after retries — caller must fall back");
  return null;
}

/** JSON response (parsed object) or null. */
export async function llmJSON(system, user, opts = {}) {
  const r = await call(system, user, { ...opts, json: true });
  if (!r) return null;
  const parsed = parseJSON(r.content);
  if (!parsed) { console.log(`  ! ${r.model} returned unparseable JSON`); return null; }
  return parsed;
}
/** Plain-text response or null. */
export async function llmText(system, user, opts = {}) {
  const r = await call(system, user, { ...opts, json: false });
  return r ? r.content.trim() : null;
}

export function llmInfo() {
  return { keys: KEYS.length, models: MODELS.map((m) => `${m.id} [${m.tier}]`), slots: slots.length };
}

/* ---------- doctor ---------- */
if (process.argv.includes("--doctor")) {
  const info = llmInfo();
  console.log("Playbook LLM scheduler");
  console.log(`  keys detected : ${info.keys}`);
  console.log(`  models        : ${info.models.join(", ")}`);
  console.log(`  budget slots  : ${info.slots}  (${info.keys} keys × ${MODELS.length} models)`);
  if (!info.keys) { console.log("  (set GROQ_API_KEY[_2/_3] to run a live ping)"); process.exit(0); }
  console.log("  live ping (tier=fast)…");
  const r = await llmJSON('Return ONLY {"ok":true}.', "ping", { tier: "fast", maxTokens: 20 });
  console.log(r ? "  ✓ live LLM reachable" : "  ✗ live ping failed (check keys / model ids)");
}
