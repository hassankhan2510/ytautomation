// STUDIO — DRAFT: raw paragraph → finished beat sheet, via a 3-stage AI DIRECTOR.
//
//   1. WRITER  (LLM)  paragraph → extracted facts, 3 scored hooks, a Gen-Z script of short lines,
//                     each line tagged with an INTENT (date, place, comparison, myth, process…).
//   2. CASTING (code) intent → ~6 best-fit scenes per line from the whole library, with no repeats,
//                     family variety and wildcards (so the AI can't lazily reuse 2-3 scenes).
//   3. DIRECTOR (LLM) picks the best candidate per line and fills its props properly (archival photo
//                     searches, real coordinates, short on-screen text).
//   + GUARD (code)    repairs bad picks, flags any number not in the source, scores the edit.
//
// The LLM never writes render code, so every draft renders. Output: src/data/drafts/<date>-<slug>.json
// Env: PARAGRAPH (required), STYLE (explainer|buildInPublic|techNews|breakdown|story),
//      VERBATIM (yes = use the paragraph word-for-word as the script), DAY, THEME, HANDLE, SEED
// All LLM calls go through the shared throttled client (free-tier TPM limits).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groqJSON } from "../../theranos-doc/scripts/lib_groq.mjs";
import { castCandidates, INTENT_LIST, scoreEdit } from "./casting.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paragraph = (process.env.PARAGRAPH || "").trim();
if (paragraph.length < 30) throw new Error("PARAGRAPH is empty/too short — paste what the video is about.");
const style = process.env.STYLE || "explainer";
const day = Number(process.env.DAY || 0) || null;
const theme = process.env.THEME && process.env.THEME !== "job" ? process.env.THEME : "crimson";
const handle = process.env.HANDLE || "@cohort_zero";
// Channel brand mark (public/ path). Cohort Zero's original logo lives in cohort_zero/02_Brand_Assets/logos
// and is copied to public/brand/cohortzero-mark.png; other channels pass LOGO.
const logo = process.env.LOGO || (handle === "@cohort_zero" ? "brand/cohortzero-mark.png" : "");
const verbatim = /^(yes|true|1)$/i.test(process.env.VERBATIM || "");
const clean = (s) => String(s ?? "").replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();

/* ───────────── Script splitting (verbatim mode) ───────────── */
const CONNECT = /^(and|but|or|so|because|which|who|that|when|while|where|with|without|until|after|before|then|by|to|into|from|on|in)$/i;
function splitLong(words) {
  if (words.length <= 18) return [words.join(" ")];
  const parts = Math.ceil(words.length / 14);
  const target = Math.round(words.length / parts);
  let best = target, bestScore = Infinity;
  for (let k = 4; k <= words.length - 4; k++) {
    let score = Math.abs(k - target);
    if (/[,;:—–]$/.test(words[k - 1])) score -= 3.5;
    else if (CONNECT.test(words[k])) score -= 1.5;
    if (score < bestScore) { bestScore = score; best = k; }
  }
  return [...splitLong(words.slice(0, best)), ...splitLong(words.slice(best))];
}
function segment(script) {
  const sentences = script.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [script];
  return sentences.map((x) => x.trim()).filter(Boolean).flatMap((x) => splitLong(x.split(" ")));
}

/* ───────────── The library, parsed straight from the registry ───────────── */
const reg = fs.readFileSync(path.join(ROOT, "src/engine/registry.ts"), "utf8");
const STR = `"((?:[^"\\\\]|\\\\.)*)"`;
const re = new RegExp(`id: "([A-Za-z0-9]+)", category: "([a-z]+)", showsText: (?:true|false), energy: (\\d), description: ${STR}, props: ${STR}`, "g");
const menu = [...reg.matchAll(re)].map((m) => ({ id: m[1], category: m[2], energy: Number(m[3]), description: m[4], props: m[5] }));
if (menu.length < 20) throw new Error(`Could not parse the primitive menu (got ${menu.length}).`);
const byId = new Map(menu.map((m) => [m.id, m]));

const STYLES = {
  explainer: "Gen-Z explainer of history / facts / research: cinematic, fast, never a textbook. Open loop in line 1, pay it off by the end.",
  buildInPublic: `Build-in-public diary, Day ${day ?? 1}. Honest, specific, proof of work.`,
  techNews: "Fast tech-news report. Neutral, factual, why-it-matters angle.",
  breakdown: "Concept/project breakdown: how X works, step by step.",
  story: "Personal story arc: hook → struggle → turning point → result → lesson.",
};

/* ═════════════ STAGE 1 — WRITER ═════════════ */
const writerSystem = `You are the head WRITER of a premium Instagram Reels studio (Gen-Z audience; brand ${handle}).
${verbatim ? "The creator already wrote the script. Keep every line EXACTLY as given; your job is to tag each line and write hooks." : "Turn the SOURCE into a 25-45 second spoken script."}
Return ONLY JSON:
{"facts":[every concrete fact in the SOURCE: numbers, dates, names, places — copied, not invented],
 "hooks":[{"text":"…","type":"curiosity|contrarian|pov|number|stakes","score":1-10}] (exactly 3, max 12 words each, different types),
 "chosen": index of the best hook,
 "lines":[{"text":"spoken line","intent":one of [${INTENT_LIST.join(", ")}],"energy":1|2|3,"visual":"what the viewer should SEE (max 12 words)"}],
 "caption":"1-2 short lines + a question that drives comments + 5 hashtags"}
SCRIPT RULES${verbatim ? " (tagging only — do not change text)" : ""}:
- ${verbatim ? "One entry in lines per given segment, same order, identical text." : "9-13 lines. Line 1 = the chosen hook. Each line ONE idea, 5-14 words, spoken casual English (contractions, 'you'), no emojis/markdown."}
- ${verbatim ? "" : "Structure: hook (open loop) → context → 3-6 escalating facts/turns (a pattern interrupt every ~3 lines: question, myth, 'but here's the thing') → payoff → takeaway. Do NOT write a follow/CTA line; it is added automatically."}
- intent = what the line IS: a date → "date", a location → "place", a person → "person", a big number → "bigNumber", two things side by side → "comparison", steps → "process", A causes B → "causeEffect", a study → "research", a misconception → "myth", hidden info → "secret", a ranking/set → "list", how it changed → "change", a tech mechanism → "tech". Use "fact"/"lesson" only when nothing more specific fits. Vary intents.
- Every line must ADD something new (a fact, a turn, a consequence). Never restate or paraphrase an earlier line.
- The hook leads with the single most surprising fact or tension in the SOURCE.
- energy: 3 hook/reveals/wins, 2 explanation, 1 reflective. Never three 1s in a row.
FACTS (strict): every number, date, name and place in the script must come from the SOURCE. Never invent statistics, quotes, studies or sources.
STYLE: ${STYLES[style] || STYLES.explainer}`;
const segments = verbatim ? segment(paragraph).slice(0, 24) : [];
const writerUser = verbatim ? `SCRIPT SEGMENTS:\n${segments.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : `SOURCE:\n"""${paragraph.slice(0, 6000)}"""`;

console.log("① WRITER…");
const written = await groqJSON(writerSystem, writerUser, { maxTokens: 3000, temperature: 0.8 });
if (!written || !Array.isArray(written.lines) || !written.lines.length) throw new Error("Writer returned no script lines.");
let lines = written.lines.slice(0, verbatim ? 24 : 14).map((l) => ({
  text: clean(l?.text),
  intent: INTENT_LIST.includes(l?.intent) ? l.intent : "fact",
  energy: [1, 2, 3].includes(Number(l?.energy)) ? Number(l.energy) : 2,
  visual: clean(l?.visual).slice(0, 120),
}));
if (verbatim) lines = segments.map((text, i) => ({ ...(lines[i] || { intent: "fact", energy: 2, visual: "" }), text }));
lines = lines.filter((l) => l.text);
const hooks = (written.hooks || []).map((h) => (typeof h === "string" ? { text: h } : h)).filter((h) => h?.text).slice(0, 3);
const chosen = Math.min(Math.max(0, Number(written.chosen) || 0), Math.max(0, hooks.length - 1));
lines[0].energy = 3;
if (!verbatim) lines[0].intent = lines[0].intent === "fact" ? "hook" : lines[0].intent;
console.log(lines.map((l, i) => `  ${i + 1}. [${l.intent}] ${l.text}`).join("\n"));

/* ═════════════ STAGE 2 — CASTING ═════════════ */
const cast = castCandidates({ lines, menu, docBias: style === "explainer", seed: Number(process.env.SEED) || paragraph.length });
if (style === "buildInPublic") cast[0].candidates = ["dayStamp", ...cast[0].candidates.filter((c) => c !== "dayStamp")];
if (style === "techNews") cast[0].candidates = ["newsBanner", ...cast[0].candidates.filter((c) => c !== "newsBanner")];
const allCands = [...new Set(cast.flatMap((c) => c.candidates))];

/* ═════════════ STAGE 3 — DIRECTOR ═════════════ */
const directorSystem = `You are the DIRECTOR / motion editor of a premium Gen-Z Instagram studio. For EACH script line choose the single best scene from THAT LINE'S candidates and fill its props.
Return ONLY JSON: {"beats":[{"i":line number,"primitive":id,"why":"max 8 words","emphasis":[1-2 words from the line],"props":{…}}]} — exactly one per line, in order.
CHOOSING: the scene must SHOW what the line SAYS (a date → time travel, a place → map lock, a comparison → true-scale or versus…). Prefer the richest, most cinematic option that fits; never pick the same id twice in the whole reel; avoid two plain-text scenes in a row.
PROPS: follow the schema exactly; on-screen strings are SHORT (titles ≤ 5 words, list items ≤ 4 words). Use ONLY facts from FACTS — never invent numbers, quotes, sources or names.
IMAGES (REQUIRED for archiveFilm, museumFrame, photo, thenNow, beforeAfter): always give "search": 2-5 words naming a REAL subject to find an archival/public-domain photo (e.g. "Apollo Guidance Computer", "Saturn V launch") AND a "prompt" fallback describing the scene visually (era, place, lighting; no text, no logos, no real living person's likeness). thenNow uses search/prompt for THEN and search2/prompt2 for NOW.
museumFrame is for a person, artifact or creature portrait (the subject itself), not for diagrams or processes. Never invent years, dates, sources or citations for any scene — leave those props out unless the FACTS contain them.
locate needs REAL coordinates (lat/lon numbers with sign). scaleCompare needs REAL relative sizes. Citations only if the source names them.`;
const scenesDoc = allCands.map((id) => { const m = byId.get(id); return `- ${id} [${m.category}]: ${m.description} PROPS: ${m.props}`; }).join("\n");
const directorUser = `FACTS:\n${(written.facts || []).map((f) => `- ${clean(f)}`).join("\n") || "- (none beyond the script)"}

SCRIPT (line → its candidates):
${lines.map((l, i) => `${i + 1}. [${l.intent}, energy ${l.energy}] "${l.text}"  (writer's visual idea: ${l.visual || "—"})\n   candidates: ${cast[i].candidates.join(", ")}`).join("\n")}

SCENE SCHEMAS:
${scenesDoc}`;

console.log("③ DIRECTOR…");
const directed = await groqJSON(directorSystem, directorUser, { maxTokens: 5000, temperature: 0.6 });
const picks = new Map((directed?.beats || []).map((b, k) => [Number(b?.i) || k + 1, b]));

/* ═════════════ GUARD — repair, enforce variety ═════════════ */
const used = new Set();
const beats = lines.map((l, k) => {
  const d = picks.get(k + 1) || {};
  const cands = cast[k].candidates;
  let primitive = byId.has(d.primitive) && !used.has(d.primitive) && d.primitive !== "outro" ? d.primitive : null;
  if (!primitive) primitive = cands.find((c) => !used.has(c)) || menu.find((m) => !used.has(m.id) && m.id !== "outro")?.id || "stomp";
  used.add(primitive);
  const beat = { text: l.text, primitive, energy: l.energy };
  if (Array.isArray(d.emphasis) && d.emphasis.length) beat.emphasis = d.emphasis.slice(0, 2).map(clean);
  if (d.props && typeof d.props === "object" && !Array.isArray(d.props) && primitive === d.primitive) beat.props = d.props;
  if (d.why) beat.why = clean(d.why);
  return beat;
});
if (style === "buildInPublic" && day) {
  const ds = beats.find((b) => b.primitive === "dayStamp");
  if (ds) ds.props = { ...(ds.props || {}), day };
}
const cta = style === "buildInPublic" ? `Follow for Day ${(day ?? 1) + 1}` : "Follow for more";
beats.push({ text: style === "buildInPublic" ? `${cta}.` : "Follow for more stories like this.", primitive: "outro", energy: 1, props: { cta }, hold: 1.0 });

/* ═════════════ FACT GUARD — numbers must come from the source ═════════════ */
const nums = (s) => (String(s).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, "").replace(/,/g, ""));
const sourceNums = new Set(nums(paragraph));
if (day) { sourceNums.add(String(day)); sourceNums.add(String(day + 1)); }
const flagged = new Set();
const places = [];
const removed = [];
const SENSITIVE = ["source", "citation", "dates", "year", "author"];
for (const b of beats) {
  for (const k of SENSITIVE) {
    const v = b.props?.[k];
    if (v === undefined || v === null || v === "") continue;
    const bad = nums(v).filter((n) => !sourceNums.has(n));
    const nameless = (k === "source" || k === "citation" || k === "author") && !paragraph.toLowerCase().includes(String(v).toLowerCase().split(/[,(]/)[0].trim());
    if (bad.length || nameless) { removed.push(`${b.primitive}.${k}="${v}"`); delete b.props[k]; }
  }
}
for (const b of beats) {
  const { prompt, prompt2, search, search2, lat, lon, ...shown } = b.props || {};
  if (lat !== undefined || lon !== undefined) places.push(`${shown.place || "?"} (${lat}, ${lon})`);
  for (const n of nums(JSON.stringify({ t: b.text, p: shown }))) if (!sourceNums.has(n) && !/^0?[0-9]$/.test(n)) flagged.add(n);
}

/* ═════════════ WRITE + REPORT ═════════════ */
const quality = scoreEdit(beats, menu);
const hookText = clean(hooks[chosen]?.text || lines[0].text);
const slug = hookText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "draft";
const date = new Date().toISOString().slice(0, 10);
const job = {
  id: `${date}-${slug}`,
  title: hookText,
  theme,
  seed: Number(process.env.SEED) || Math.floor(Math.random() * 9000) + 100,
  handle,
  ...(logo ? { logo } : {}),
  hooks: hooks.map((h) => clean(h.text)),
  caption: String(written.caption || "").trim(),
  quality,
  ...(flagged.size ? { unverifiedNumbers: [...flagged] } : {}),
  beats,
};
const rel = `src/data/drafts/${job.id}.json`;
fs.mkdirSync(path.join(ROOT, "src/data/drafts"), { recursive: true });
fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(job, null, 2) + "\n");

const report = [
  `### Draft: \`${rel}\``,
  "",
  `**Edit quality ${quality.score}/10** — ${quality.unique}/${quality.total} unique scenes · ${quality.families} families · ${quality.doc} documentary · ${quality.plain} plain-text${quality.repeats ? ` · ⚠️ ${quality.repeats} repeats` : ""}`,
  "",
  "**Hooks** (★ = used):",
  ...hooks.map((h, i) => `${i === chosen ? "★" : "-"} ${clean(h.text)}${h.type ? ` _(${h.type}${h.score ? `, ${h.score}/10` : ""})_` : ""}`),
  "",
  "**Script → scenes:**",
  ...beats.map((b, i) => `${i + 1}. \`${b.primitive}\` — ${b.text}${b.why ? `  _(${b.why})_` : ""}`),
  "",
  flagged.size ? `⚠️ **Numbers not found in your paragraph — check before posting:** ${[...flagged].join(", ")}` : "✅ Every number on screen comes from your paragraph.",
  ...(places.length ? ["", `📍 **Map locations to double-check:** ${places.join("; ")}`] : []),
  ...(removed.length ? ["", `🧹 **Removed invented attribution (not in your paragraph):** ${removed.join("; ")}`] : []),
  "",
  "**Caption:**",
  "```",
  job.caption,
  "```",
];
console.log(report.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `draft=${rel}\n`);
