/**
 * PLAYBOOK LLM SCHEDULER — a (key × model) budget matrix over Groq's free tier.
 *
 * Groq free tier limits are PER MODEL, PER KEY: ~30 req/min (RPM), ~1,000 req/day (RPD, resets at UTC
 * midnight), ~8,000 tokens/min (TPM). With K keys × M models you get K×M independent budget slots.
 *
 * This scheduler:
 *   1. Picks the slot whose model TIER matches the task (high tasks -> gpt-oss-120b; cheap tasks -> 20b),
 *      preferring the EXACT tier so cheap work never starves the high-quality model, then a HIGHER tier
 *      if the exact one is momentarily busy, and only dropping BELOW tier if the tier is out for the day.
 *   2. Clamps max_tokens so (input+output) fits the slot's TPM -> no 413.
 *   3. On 429 cools that slot for the minute and rotates. On 404 (model gone) it kills that model's slots
 *      permanently — no more wasted retries.
 *   4. Skips Groq's strict json_object mode for gpt-oss models (it 400s constantly on reasoning models);
 *      relies on "return ONLY JSON" + a tolerant parser instead. Models that support json_object use it.
 *   5. Persists the DAILY (RPD) counters to disk so a resumed 2-hour run respects the 1K/day cap.
 *
 * Keys:   GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3   (or GROQ_API_KEYS="k1,k2,k3")
 * Models: PB_MODELS='[{"id":"openai/gpt-oss-120b","tier":"high"},{"id":"openai/gpt-oss-20b","tier":"mid"}]'
 */

import fs from "node:fs";

const API = "https://api.groq.com/openai/v1/chat/completions";

/* ---------- config ---------- */
// Default pool = the two models that are reliably available on the Groq free tier. gpt-oss-120b for
// quality work, gpt-oss-20b for cheap/bulk work. Override with PB_MODELS to add others (e.g. a qwen id
// you actually have access to).
const DEFAULT_MODELS = [
  { id: "openai/gpt-oss-120b", tier: "high", tpm: 8000, rpm: 30, rpd: 1000 },
  { id: "openai/gpt-oss-20b",  tier: "mid",  tpm: 8000, rpm: 30, rpd: 1000 },
];
const TIER_RANK = { fast: 1, mid: 2, high: 3 };
// Groq's response_format:json_object 400s constantly on gpt-oss reasoning models — skip it for them.
const supportsJsonMode = (id) => !/gpt-oss/i.test(id);

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
const est = (s) => Math.ceil(((s || "").length + 3) / 3.6);
const utcDay = () => new Date().toISOString().slice(0, 10);

/* ---------- slot state: one per (key, model) ---------- */
const slots = [];
for (let k = 0; k < KEYS.length; k++) for (let m = 0; m < MODELS.length; m++) {
  slots.push({
    key: KEYS[k], keyIdx: k, model: MODELS[m],
    tpmStart: 0, tpmUsed: 0, rpmStart: 0, rpmCount: 0,
    rpdDay: utcDay(), rpdCount: 0, cooldownUntil: 0, dead: false,
  });
}

/* ---------- disk persistence for the daily (RPD) counters ---------- */
let BUDGET_FILE = process.env.PB_BUDGET_FILE || "";
export function setBudgetFile(p) { BUDGET_FILE = p; loadBudget(); }
function loadBudget() {
  if (!BUDGET_FILE || !fs.existsSync(BUDGET_FILE)) return;
  try {
    const d = JSON.parse(fs.readFileSync(BUDGET_FILE, "utf-8"));
    const today = utcDay();
    for (const s of slots) { const rec = d[`${s.keyIdx}:${s.model.id}`]; if (rec && rec.day === today) { s.rpdDay = today; s.rpdCount = rec.count || 0; } }
  } catch { /* start fresh */ }
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
const budgetOf = (model) => Math.floor(model.tpm * 0.9);
function slotFree(s, cost, now) {
  if (s.dead || now < s.cooldownUntil) return false;
  if (s.rpdCount >= s.model.rpd || s.rpmCount >= s.model.rpm) return false;
  const free = budgetOf(s.model) - s.tpmUsed;
  return s.tpmUsed === 0 || cost <= free;
}
function killModel(modelId) { for (const s of slots) if (s.model.id === modelId) s.dead = true; }

/**
 * Reserve the best slot. Prefer the EXACT tier, then higher tiers, then (only if the tier is out for the
 * day) lower tiers. Waits when everything usable is momentarily busy.
 */
async function reserve(cost, floorRank) {
  if (slots.every((s) => s.dead)) throw new Error("all models dead (check model ids / access)");
  for (let spins = 0; ; spins++) {
    const now = Date.now();
    for (const s of slots) refresh(s, now);

    // 1) exact tier, then higher tiers
    for (let r = floorRank; r <= 3; r++) {
      let best = null, bestFree = -1;
      for (const s of slots) { if ((TIER_RANK[s.model.tier] || 1) !== r) continue; if (slotFree(s, cost, now)) { const free = budgetOf(s.model) - s.tpmUsed; if (free > bestFree) { bestFree = free; best = s; } } }
      if (best) { best.tpmUsed += cost; best.rpmCount += 1; best.rpdCount += 1; saveBudget(); return best; }
    }

    // 2) is any slot at/above the floor still alive for the day?
    let dayLive = false, soonest = 15000;
    for (const s of slots) {
      const r = TIER_RANK[s.model.tier] || 1;
      if (r < floorRank || s.dead) continue;
      if (s.rpdCount < s.model.rpd) dayLive = true;
      const tW = Math.max(0, 60000 - (now - s.tpmStart)), rW = Math.max(0, 60000 - (now - s.rpmStart)), cW = s.cooldownUntil > now ? s.cooldownUntil - now : 0;
      soonest = Math.min(soonest, Math.max(500, Math.min(tW || 60000, rW || 60000) , cW || 60000));
    }
    // 3) tier exhausted for the day -> drop a tier (loud); else wait for a window/cooldown to clear
    if (!dayLive) {
      if (floorRank > 1) { console.log(`  ⚠ tier>=${floorRank} out of daily budget — dropping to tier ${floorRank - 1}`); return reserve(cost, floorRank - 1); }
      console.log(`  … all slots at daily limit — waiting for reset`); await sleep(30000); continue;
    }
    const wait = Math.max(500, Math.min(soonest + 300, 61000));
    if (spins % 8 === 0) console.log(`  … LLM budget guard: usable slots busy — pausing ${Math.ceil(wait / 1000)}s`);
    await sleep(wait);
  }
}
function markCooldown(s, ms) { s.cooldownUntil = Date.now() + ms; }
function parseRetryMs(body) { const m = /try again in ([\d.]+)\s*s/i.exec(body || ""); return m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : null; }
function parseJSON(txt) { try { return JSON.parse(txt); } catch { const m = (txt || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } } }

async function call(system, user, opts = {}) {
  if (!KEYS.length) { console.log("  ! No GROQ_API_KEY set — caller must fall back"); return null; }
  const floorRank = TIER_RANK[opts.tier || "high"] || 3;
  const temperature = opts.temperature ?? 0.5;
  const wantJson = opts.json !== false;
  const inputEst = est(system) + est(user);

  for (let attempt = 1; attempt <= 6; attempt++) {
    let slot;
    try { slot = await reserve(inputEst + (opts.maxTokens ?? 1400), floorRank); }
    catch (e) { console.log(`  ! ${e.message}`); return null; }
    const budget = budgetOf(slot.model);
    const cap = Math.max(256, Math.min(opts.maxTokens ?? 1400, budget - inputEst - 200));
    const useJsonMode = wantJson && supportsJsonMode(slot.model.id);
    try {
      const payload = { model: slot.model.id, temperature, max_tokens: cap, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
      if (useJsonMode) payload.response_format = { type: "json_object" };
      const res = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${slot.key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (res.status === 404) { const b = await res.text().catch(() => ""); console.log(`  ! 404 ${slot.model.id} — disabling this model (${b.slice(0, 80)})`); killModel(slot.model.id); continue; }
      if (res.status === 413) { console.log(`  ! 413 too-large on ${slot.model.id} — retrying smaller`); continue; }
      if (res.status === 429) { const b = await res.text().catch(() => ""); markCooldown(slot, parseRetryMs(b) ?? 12000); if (attempt <= 2) console.log(`  ! 429 ${slot.model.id} key#${slot.keyIdx + 1} — cooling + rotating`); continue; }
      if (res.status === 400) { const b = await res.text().catch(() => ""); console.log(`  ! 400 ${slot.model.id} — ${b.slice(0, 90)} (retrying)`); await sleep(600 * attempt); continue; }
      if (res.status >= 500) { console.log(`  ! ${res.status} ${slot.model.id} — retrying`); await sleep(1200 * attempt); continue; }
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => "")).slice(0, 140)}`);

      const d = await res.json();
      const used = d?.usage?.total_tokens;
      if (used) slot.tpmUsed += Math.max(0, used - (inputEst + cap));
      const content = d.choices?.[0]?.message?.content || "";
      if (!content.trim()) throw new Error("empty completion");
      return { content, model: slot.model.id, keyIdx: slot.keyIdx };
    } catch (e) {
      console.log(`  ! LLM attempt ${attempt}/6 on ${slot.model.id}: ${e.message}`);
      if (attempt < 6) await sleep(700 * attempt);
    }
  }
  console.log("  ! LLM unavailable after retries — caller must fall back");
  return null;
}

export async function llmJSON(system, user, opts = {}) {
  const r = await call(system, user, { ...opts, json: true });
  if (!r) return null;
  const parsed = parseJSON(r.content);
  if (!parsed) { console.log(`  ! ${r.model} returned unparseable JSON`); return null; }
  return parsed;
}
export async function llmText(system, user, opts = {}) { const r = await call(system, user, { ...opts, json: false }); return r ? r.content.trim() : null; }
export function llmInfo() { return { keys: KEYS.length, models: MODELS.map((m) => `${m.id} [${m.tier}]`), slots: slots.length }; }

/* ---------- doctor ---------- */
if (process.argv.includes("--doctor")) {
  const info = llmInfo();
  console.log("Playbook LLM scheduler");
  console.log(`  keys detected : ${info.keys}`);
  console.log(`  models        : ${info.models.join(", ")}`);
  console.log(`  budget slots  : ${info.slots}  (${info.keys} keys × ${MODELS.length} models)`);
  if (!info.keys) { console.log("  (set GROQ_API_KEY[_2/_3] to run a live ping)"); process.exit(0); }
  const r = await llmJSON('Return ONLY {"ok":true}.', "ping", { tier: "fast", maxTokens: 20 });
  console.log(r ? "  ✓ live LLM reachable" : "  ✗ live ping failed (check keys / model ids)");
}
