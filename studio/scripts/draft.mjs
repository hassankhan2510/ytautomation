// STUDIO — DRAFT: paragraph → 3 hooks + a full beat sheet (the "editor" step).
// The LLM only PICKS primitives from the registry menu and fills their props; it never writes
// render code, so every draft renders. Output: src/data/drafts/<date>-<slug>.json (edit it on
// GitHub, then render it with "Studio — Render Reel").
//
// Env: PARAGRAPH (required), STYLE (buildInPublic|techNews|breakdown|story), DAY, THEME, HANDLE, SEED
// All LLM calls go through the shared throttled client (free-tier TPM limits).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groqJSON } from "../../theranos-doc/scripts/lib_groq.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paragraph = (process.env.PARAGRAPH || "").trim();
if (paragraph.length < 30) throw new Error("PARAGRAPH is empty/too short — paste what the video is about.");
const style = process.env.STYLE || "buildInPublic";
const day = Number(process.env.DAY || 0) || null;
const theme = process.env.THEME && process.env.THEME !== "job" ? process.env.THEME : "crimson";
const handle = process.env.HANDLE || "@cohort_zero";

/* ── 1. The menu, parsed straight from the registry (single source of truth) ── */
const reg = fs.readFileSync(path.join(ROOT, "src/engine/registry.ts"), "utf8");
const STR = `"((?:[^"\\\\]|\\\\.)*)"`;
const re = new RegExp(`id: "([A-Za-z0-9]+)", category: "([a-z]+)", showsText: (?:true|false), energy: (\\d), description: ${STR}, props: ${STR}`, "g");
const menu = [...reg.matchAll(re)].map((m) => ({ id: m[1], category: m[2], energy: Number(m[3]), description: m[4], props: m[5] }));
if (menu.length < 20) throw new Error(`Could not parse the primitive menu (got ${menu.length}).`);
const ids = new Set(menu.map((m) => m.id));
const menuText = menu.map((m) => `- ${m.id} [${m.category}, e${m.energy}]: ${m.description} PROPS: ${m.props}`).join("\n");

/* ── 2. Prompt ── */
const STYLES = {
  buildInPublic: `Build-in-public diary. Beat 1 MUST be "dayStamp" with props.day=${day ?? 1}. Show proof of work (terminal, code, ghGrid, checklist, isoBuild).`,
  techNews: `Fast tech-news report. Beat 1 MUST be "newsBanner". Use headlines/history/globe/neuralNet/quadrant where they fit. Neutral, factual tone.`,
  breakdown: `Project/concept breakdown ("how X works"). Open on a strong hook primitive; use explainers (mindMap, roadmap, funnel, pyramid, isoBuild, neuralNet).`,
  story: `Personal story arc: hook → struggle → turning point → result → lesson. Use meme formats (pov, errorPopups, loading, iceberg, verdict) where they fit.`,
};
const system = `You are the EDITOR of a premium Instagram Reels studio (Gen-Z audience, founder/tech niche, brand ${handle}).
You turn a source paragraph into a 25-40 second vertical reel by choosing MOTION PRIMITIVES from a fixed menu and filling their props.
Return ONLY a JSON object: {"hooks":[3 strings],"chosen":0|1|2,"caption":string,"beats":[...]}.

HOOKS: 3 different scroll-stopping first lines (max 10 words each): one curiosity gap, one bold claim, one relatable/POV. "chosen" = the strongest.
BEATS (9-13 total). Each beat: {"text": what is SPOKEN (max 14 words, casual spoken English, no emojis, no markdown, no hashtags), "primitive": id from MENU, "energy": 1|2|3, "emphasis": [1-2 words from text], "props": {...per the primitive's PROPS}}.
- Beat 1 speaks the chosen hook. Last beat MUST be "outro" with props.cta (e.g. "Follow for Day ${(day ?? 1) + 1}").
- Never use the same primitive twice in a row; use each at most twice; mix families (text, ui, data, generative, memes).
- Energy: 3 for hook/reveals/wins, 2 for explanation, 1 for calm/reflective beats. Rhythm: don't put three 1s in a row.
- Props: keep strings SHORT (they are on-screen). Only use props listed for that primitive.
FACTS (strict): never invent numbers, statistics, quotes, people, or company/publication names that are not in the SOURCE.
If the source has no numbers, do NOT use number-driven primitives (counter, bars, statGrid, lineChart, ring, meter, pie, funnel, scoreboard, price) with made-up values.
Invented outlet names for "headlines" must be obviously generic (e.g. "THE BUILD DAILY").
CAPTION: 1-2 short lines + a question to drive comments + 5 relevant hashtags.
STYLE: ${STYLES[style] || STYLES.buildInPublic}

MENU:
${menuText}`;
const user = `SOURCE:\n"""${paragraph.slice(0, 6000)}"""`;

/* ── 3. Call + validate (never trust the LLM shape) ── */
const out = await groqJSON(system, user, { maxTokens: 4000, temperature: 0.7 });
if (!out || !Array.isArray(out.beats) || !out.beats.length) throw new Error("Groq returned no usable beats (see log above).");

const clean = (s) => String(s ?? "").replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
let prev = "";
const beats = out.beats.slice(0, 14).map((b, i) => {
  let primitive = ids.has(b?.primitive) ? b.primitive : "stomp";
  if (primitive === prev && primitive !== "outro") primitive = prev === "stomp" ? "flip3d" : "stomp";
  prev = primitive;
  const energy = [1, 2, 3].includes(Number(b?.energy)) ? Number(b.energy) : 2;
  const text = clean(b?.text).split(" ").slice(0, 18).join(" ") || "…";
  const beat = { text, primitive, energy };
  if (Array.isArray(b?.emphasis) && b.emphasis.length) beat.emphasis = b.emphasis.slice(0, 2).map(clean);
  if (b?.props && typeof b.props === "object" && !Array.isArray(b.props)) beat.props = b.props;
  if (i === 0) beat.energy = 3;
  return beat;
});
if (beats[beats.length - 1].primitive !== "outro") beats.push({ text: `Follow for Day ${(day ?? 1) + 1}.`, primitive: "outro", energy: 1, props: { cta: `Follow for Day ${(day ?? 1) + 1}` } });
beats[beats.length - 1].hold = 1.0;
if (style === "buildInPublic" && day) {
  const first = beats.find((b) => b.primitive === "dayStamp");
  if (first) first.props = { ...(first.props || {}), day };
}

/* ── 4. Hallucination guard: every number on screen/spoken must appear in the source ── */
const nums = (s) => (String(s).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, "").replace(/,/g, ""));
const sourceNums = new Set(nums(paragraph));
if (day) { sourceNums.add(String(day)); sourceNums.add(String(day + 1)); }
const flagged = new Set();
for (const b of beats) for (const n of nums(JSON.stringify({ t: b.text, p: b.props || {} }))) if (!sourceNums.has(n) && !/^0?[0-9]$/.test(n)) flagged.add(n);

/* ── 5. Write the draft ── */
const slug = clean(out.hooks?.[out.chosen ?? 0] || paragraph).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "draft";
const date = new Date().toISOString().slice(0, 10);
const job = {
  id: `${date}-${slug}`,
  title: clean(out.hooks?.[out.chosen ?? 0] || ""),
  theme,
  seed: Number(process.env.SEED) || Math.floor(Math.random() * 9000) + 100,
  handle,
  hooks: (out.hooks || []).map(clean).slice(0, 3),
  caption: String(out.caption || "").trim(),
  ...(flagged.size ? { unverifiedNumbers: [...flagged] } : {}),
  beats,
};
const rel = `src/data/drafts/${job.id}.json`;
fs.mkdirSync(path.join(ROOT, "src/data/drafts"), { recursive: true });
fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(job, null, 2) + "\n");

/* ── 6. Report (also into the Actions run summary) ── */
const lines = [
  `### Draft: \`${rel}\``,
  "",
  "**Hooks** (beat 1 uses the ★ one — edit the JSON to swap):",
  ...job.hooks.map((h, i) => `${i === (out.chosen ?? 0) ? "★" : "-"} ${h}`),
  "",
  `**Beats (${beats.length}):** ${beats.map((b) => b.primitive).join(" → ")}`,
  "",
  ...(flagged.size ? [`⚠️ **Numbers not found in your paragraph — check before posting:** ${[...flagged].join(", ")}`, ""] : ["✅ Every number on screen comes from your paragraph.", ""]),
  "**Caption:**",
  "```",
  job.caption,
  "```",
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `draft=${rel}\n`);
