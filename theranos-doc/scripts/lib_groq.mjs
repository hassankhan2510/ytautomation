/**
 * ONE Groq client for every script — multi-key + throttled + retry-aware so the free-tier limits
 * never silently break a channel again, and quality never has to be shrunk to fit.
 *
 * The free tier caps TOKENS-PER-MINUTE (input + output both count): gpt-oss-120b = 8,000 TPM.
 * Two failure modes killed content before: 413 "request too large" (a single request's input+output
 * exceeded the whole TPM budget) and 429 "rate limit" (several calls in one minute blew the budget).
 *
 * This client prevents both AND multiplies throughput by rotating across every API key you provide:
 *   1. Clamps max_tokens so (estimated input + output) always fits ONE key's TPM budget → no 413.
 *   2. A per-key rolling-60s governor picks the key with the most headroom and spaces calls → no 429.
 *      Two keys ≈ 2× TPM, so a multi-call pipeline (LinkedIn analyze→compose→edit) runs with little/no
 *      waiting and at full output length — quality intact.
 *   3. On 429 it marks that key spent and instantly rotates to the other key (or waits out the window).
 *   4. On 413 it shrinks max_tokens and retries. Optional GROQ_FALLBACK_MODEL is tried last.
 *
 * Keys (any of): GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, or GROQ_API_KEYS="k1,k2,...".
 * Set GROQ_TPM if a key's per-minute limit differs (default 8000, applied PER key).
 */

const API = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || "";
const TPM = Number(process.env.GROQ_TPM || 8000);
const BUDGET = Math.floor(TPM * 0.9); // 10% headroom for token-estimate error, per key

// Gather every distinct key provided.
const KEYS = [
  ...(process.env.GROQ_API_KEYS ? process.env.GROQ_API_KEYS.split(",") : []),
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
].map((s) => (s || "").trim()).filter(Boolean);
const UNIQUE_KEYS = [...new Set(KEYS)];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const est = (s) => Math.ceil(((s || "").length + 3) / 3.6); // ~4 chars/token, slight over-estimate

/* ---------- per-key rolling-60s TPM governor ---------- */
const winStart = UNIQUE_KEYS.map(() => 0);
const winUsed = UNIQUE_KEYS.map(() => 0);
// Reserve `cost` tokens on the emptiest key with room; wait for the soonest window reset if all full.
async function reserve(cost) {
  for (;;) {
    const t = Date.now();
    let best = -1, bestFree = -1, soonest = 60000;
    for (let i = 0; i < UNIQUE_KEYS.length; i++) {
      if (t - winStart[i] >= 60000) { winStart[i] = t; winUsed[i] = 0; }
      const free = BUDGET - winUsed[i];
      if (winUsed[i] === 0 || cost <= free) { if (free > bestFree) { bestFree = free; best = i; } }
      soonest = Math.min(soonest, 60000 - (t - winStart[i]));
    }
    if (best >= 0) { winUsed[best] += cost; return best; }
    const wait = Math.max(300, soonest + 300);
    console.log(`  … Groq TPM guard: all ${UNIQUE_KEYS.length} key(s) at limit — pausing ${Math.ceil(wait / 1000)}s`);
    await sleep(wait);
  }
}
function markKeyFull(i) { winStart[i] = Date.now(); winUsed[i] = BUDGET; }

function parseRetryMs(body) {
  const m = /try again in ([\d.]+)\s*s/i.exec(body || "");
  return m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : null;
}
function parseJSON(txt) {
  try { return JSON.parse(txt); } catch { const m = (txt || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
}

/**
 * Call Groq for a JSON response. Returns the parsed object, or null (caller decides fallback/abort).
 * opts: { maxTokens, temperature, model }
 */
export async function groqJSON(system, user, opts = {}) {
  if (!UNIQUE_KEYS.length) { console.log("  ! No Groq API key set — caller will fall back"); return null; }
  const temperature = opts.temperature ?? 0.5;
  const models = [opts.model || GROQ_MODEL, ...(FALLBACK_MODEL && FALLBACK_MODEL !== (opts.model || GROQ_MODEL) ? [FALLBACK_MODEL] : [])];
  const inputEst = est(system) + est(user);
  let cap = Math.max(256, Math.min(opts.maxTokens ?? 1500, BUDGET - inputEst - 200));
  if (inputEst + 300 > BUDGET) console.log(`  ! Groq: prompt is large (~${inputEst} tok vs ${BUDGET}/key) — output clamped to ${cap}`);

  for (const model of models) {
    // Compound is an agentic SYSTEM and rejects response_format json_object; rely on the prompt instead.
    const isCompound = /compound/i.test(model);
    // Compound rejects json_object; and gpt-oss sometimes 400s "json_validate_failed" (its reasoning
    // truncates the JSON). Start in JSON mode unless compound, and drop to prompt-guided mode on such a
    // 400 — parseJSON is tolerant, so we still get valid JSON out.
    let jsonMode = !isCompound;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const keyIdx = await reserve(inputEst + cap);
      try {
        const payload = { model, temperature, max_tokens: cap, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
        if (jsonMode) payload.response_format = { type: "json_object" };
        const res = await fetch(API, {
          method: "POST",
          headers: { Authorization: `Bearer ${UNIQUE_KEYS[keyIdx]}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 413) {
          const body = await res.text().catch(() => "");
          cap = Math.floor(cap * 0.6);
          console.log(`  ! Groq 413 (too large) — shrinking output to ${cap} and retrying`);
          if (cap < 300) { console.log(`  ! Groq: can't fit under the ${TPM} TPM budget — ${body.slice(0, 120)}`); break; }
          continue;
        }
        if (res.status === 429) {
          const body = await res.text().catch(() => "");
          markKeyFull(keyIdx);
          if (UNIQUE_KEYS.length > 1) {
            console.log(`  ! Groq 429 on key #${keyIdx + 1} — rotating to another key (attempt ${attempt}/4)`);
            continue; // reserve() will pick a key with headroom
          }
          const wait = parseRetryMs(body) ?? 15000 * attempt;
          console.log(`  ! Groq 429 (rate limit) — waiting ${Math.ceil(wait / 1000)}s then retry (${attempt}/4)`);
          await sleep(wait);
          continue;
        }
        if (res.status === 400) {
          const body = await res.text().catch(() => "");
          if (jsonMode && /json_validate|failed_generation|json|response_format/i.test(body)) {
            jsonMode = false;
            console.log(`  ! Groq 400 JSON-mode validation — retrying WITHOUT json_object (prompt-guided) [${model}]`);
            continue; // same attempt budget; parseJSON will handle the raw output
          }
          throw new Error(`Groq 400: ${body.slice(0, 180)}`);
        }
        if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text().catch(() => "")).slice(0, 180)}`);
        const d = await res.json();
        const used = d?.usage?.total_tokens;
        if (used) winUsed[keyIdx] += Math.max(0, used - (inputEst + cap)); // reconcile estimate vs actual
        const parsed = parseJSON(d.choices?.[0]?.message?.content || "");
        if (parsed) { console.log(`  ✓ Groq OK (${model}${UNIQUE_KEYS.length > 1 ? `, key #${keyIdx + 1}` : ""})`); return parsed; }
        throw new Error("empty/unparseable JSON");
      } catch (e) {
        console.log(`  ! Groq attempt ${attempt}/4 failed${model !== models[0] ? ` [fallback ${model}]` : ""}: ${e.message}`);
        if (attempt < 4) await sleep(1000 * attempt);
      }
    }
    if (models.length > 1) console.log(`  … trying fallback model`);
  }
  console.log("  ! Groq unavailable after retries — caller will fall back");
  return null;
}
