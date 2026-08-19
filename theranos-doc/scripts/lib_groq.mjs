/**
 * ONE Groq client for every script — throttled + retry-aware so the free-tier limits never silently
 * break a channel again.
 *
 * The free tier caps TOKENS-PER-MINUTE (input + output both count): gpt-oss-120b = 8,000 TPM, most
 * other models = 6,000. Two failure modes killed content before:
 *   - 413 "request too large": a SINGLE request's (input + max_tokens) exceeded the whole TPM budget.
 *   - 429 "rate limit": several calls in one minute blew the shared per-minute budget.
 *
 * This client prevents both:
 *   1. It clamps max_tokens so (estimated input + output) always fits inside the TPM budget.
 *   2. A rolling-60s governor spaces calls so a script's multiple calls don't exceed TPM/minute.
 *   3. On 429 it reads Groq's "try again in Xs" and waits exactly that long, then retries.
 *   4. On 413 it shrinks max_tokens and retries.
 *   5. Optional GROQ_FALLBACK_MODEL is tried if the primary keeps failing.
 *
 * Set GROQ_TPM if your key's limit differs (default 8000). Set GROQ_FALLBACK_MODEL to add a backup.
 */

const API = "https://api.groq.com/openai/v1/chat/completions";
const KEY = process.env.GROQ_API_KEY || "";
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || ""; // e.g. "llama-3.1-8b-instant" (6k TPM)
const TPM = Number(process.env.GROQ_TPM || 8000);
const BUDGET = Math.floor(TPM * 0.9); // keep 10% headroom for token-estimate error

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Rough token estimate (~4 chars/token). Deliberately a slight over-estimate for safety.
const est = (s) => Math.ceil(((s || "").length + 3) / 3.6);

/* ---------- rolling-60s TPM governor (per process) ---------- */
let winStart = 0, winUsed = 0;
async function reserve(cost) {
  for (;;) {
    const t = Date.now();
    if (t - winStart >= 60000) { winStart = t; winUsed = 0; }
    // Allow the reservation if it fits, or if the window is empty (a lone request still capped elsewhere).
    if (winUsed + cost <= BUDGET || winUsed === 0) { winUsed += cost; return; }
    const wait = 60000 - (t - winStart) + 300;
    console.log(`  … Groq TPM guard: pausing ${Math.ceil(wait / 1000)}s (used ${winUsed}/${BUDGET} this minute)`);
    await sleep(wait);
  }
}
function forceWindowFull() { winStart = Date.now(); winUsed = BUDGET; }

function parseRetryMs(body) {
  const m = /try again in ([\d.]+)\s*s/i.exec(body || "");
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 500;
  return null;
}
function parseJSON(txt) {
  try { return JSON.parse(txt); } catch { const m = (txt || "").match(/\{[\s\S]*\}/); return m ? (() => { try { return JSON.parse(m[0]); } catch { return null; } })() : null; }
}

/**
 * Call Groq for a JSON response. Returns the parsed object, or null (caller decides fallback/abort).
 * opts: { maxTokens, temperature, model, label }
 */
export async function groqJSON(system, user, opts = {}) {
  if (!KEY) { console.log("  ! GROQ_API_KEY not set — caller will fall back"); return null; }
  const temperature = opts.temperature ?? 0.5;
  const models = [opts.model || GROQ_MODEL, ...(FALLBACK_MODEL ? [FALLBACK_MODEL] : [])];
  const inputEst = est(system) + est(user);
  // Clamp output so (input + output) fits the per-minute budget — this is what prevents 413.
  let cap = Math.max(256, Math.min(opts.maxTokens ?? 1500, BUDGET - inputEst - 200));
  if (inputEst + 300 > BUDGET) {
    console.log(`  ! Groq: prompt is large (~${inputEst} tok vs ${BUDGET} budget) — output clamped to ${cap}`);
  }

  for (const model of models) {
    // Compound is an agentic SYSTEM (auto web-search/code-exec) and rejects response_format json_object.
    // Drop that param for compound and rely on the prompt ("Return ONLY JSON") + our tolerant parser.
    const isCompound = /compound/i.test(model);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await reserve(inputEst + cap);
      try {
        const payload = { model, temperature, max_tokens: cap, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
        if (!isCompound) payload.response_format = { type: "json_object" };
        const res = await fetch(API, {
          method: "POST",
          headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
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
          const wait = parseRetryMs(body) ?? 15000 * attempt;
          console.log(`  ! Groq 429 (rate limit) — waiting ${Math.ceil(wait / 1000)}s then retry (${attempt}/4)`);
          forceWindowFull();
          await sleep(wait);
          continue;
        }
        if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text().catch(() => "")).slice(0, 180)}`);
        const d = await res.json();
        const used = d?.usage?.total_tokens;
        if (used) winUsed += Math.max(0, used - (inputEst + cap)); // reconcile estimate vs actual
        const parsed = parseJSON(d.choices?.[0]?.message?.content || "");
        if (parsed) { console.log(`  ✓ Groq OK (${model})`); return parsed; }
        throw new Error("empty/unparseable JSON");
      } catch (e) {
        console.log(`  ! Groq attempt ${attempt}/4 failed${model !== models[0] ? ` [fallback ${model}]` : ""}: ${e.message}`);
        if (attempt < 4) await sleep(1200 * attempt);
      }
    }
    if (models.length > 1) console.log(`  … trying fallback model`);
  }
  console.log("  ! Groq unavailable after retries — caller will fall back");
  return null;
}
