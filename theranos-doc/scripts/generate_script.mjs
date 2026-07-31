/**
 * AUTO-WRITER: turn a channel (+ optional topic) into ready-to-render job files, using a
 * FREE Groq model. Anti-hallucination via Wikipedia grounding.
 *   MODE=long+shorts : long video, then a second pass derives hook-worthy shorts FROM it.
 *   MODE=long        : long video only.
 *   MODE=shorts      : reels written DIRECTLY from the topic — no long video (one call, faster).
 *
 *   CHANNEL=syndar TOPIC="why cameras fail in the dark" GROQ_API_KEY=xxx node scripts/generate_script.mjs
 *   node scripts/generate_script.mjs --dry            # no API — canned sample, tests the plumbing
 *
 * Writes:  jobs/<channel>.json (long)  +  jobs/<channel>_short_1..N.json  +  jobs/<channel>.research.md
 * Then render with:  npm run batch -- --only=<channel>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const JOBS = path.join(ROOT, "jobs");

const DRY = process.argv.includes("--dry");
const CHANNEL = (process.env.CHANNEL || process.argv[2] || "").toLowerCase().replace(/^--/, "");
const TOPIC = process.env.TOPIC || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SEC_PER_LINE = { "youtube-long": 7, linkedin: 6, shorts: 4.5, reel: 4.5 };

function loadConfig() {
  const cfgPath = path.join(REPO, "channels", "config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  if (!cfg[CHANNEL]) {
    console.error(`Unknown channel "${CHANNEL}". Options: ${Object.keys(cfg).join(", ")}`);
    process.exit(1);
  }
  return cfg[CHANNEL];
}

function readNichePack(niche) {
  const p = path.join(REPO, "docs", "NICHES", `${niche}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}

/* ---------- Wikipedia grounding (free, anti-hallucination) ---------- */
async function ground(topic) {
  try {
    const s = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*`,
    );
    const sd = await s.json();
    const hits = (sd.query?.search || []).slice(0, 2);
    const out = [];
    for (const h of hits) {
      const sum = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
      );
      if (!sum.ok) continue;
      const d = await sum.json();
      if (d.extract) {
        out.push({ title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(d.title)}` });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/* ---------- Groq ---------- */
async function callGroq(system, user) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.6,
          max_tokens: 6000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      return extractJson(content);
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Groq did not return valid JSON");
  }
}

/* ---------- prompt building ---------- */
const RULES = `
OUTPUT: a single JSON object. No prose outside JSON.
Shape: { "title": string, "titleOptions": string[3-5], "hashtags": string[5-10],
  "description": string, "tags": string[>=3],
  "lines": [ { "text": string, "caption"?: string, "keywords": string[1-2],
    "type": "image"|"video", "layout": "lower-third"|"center"|"title"|"stat"|"quote"|"bullets"|"nametag"|"timeline"|"chart"|"meter",
    "kicker"?: string, "stat"?: string, "cite"?: string, "items"?: string[], "name"?: string, "role"?: string,
    "events"?: [{ "label": string, "text": string }], "percent"?: number } ] }
RULES:
- One idea per line; each line ~12-22 words of spoken narration.
- TITLE must be rank-fast: keyword + curiosity + specificity. titleOptions = varied alternatives.
- Spell numbers/symbols for TTS ("nine billion", not "$9B"); put "$9B" only in a stat/caption field.
- Use a MIX of layouts (this is what makes it look produced, not generic AI): mostly lower-third,
  but a "center" or "title" for the hook and big statements, at least one "stat", a "nametag" if a
  person matters, one "bullets", and a "kicker" label on the first line of each act.
- keywords = concrete stock-footage search terms (e.g. "rocket launch night").`;

function langRule(language) {
  if (language === "ur") return `\nLANGUAGE: write "text" in natural URDISH (Urdu script with common English words inline, e.g. "Uber نے Careem کو acquire کیا"). Put the ENGLISH on-screen version in "caption" for EVERY line.`;
  if (language === "hi") return `\nLANGUAGE: write "text" in natural HINGLISH (Hindi script with English words inline). Put the ENGLISH on-screen version in "caption" for EVERY line.`;
  return `\nLANGUAGE: English. No "caption" needed.`;
}

function groundingText(g) {
  if (!g.length) return "";
  return "\nGROUNDING (base your facts ONLY on this; do not invent specifics):\n" +
    g.map((x) => `- ${x.title}: ${x.extract}`).join("\n");
}

/* ---------- assembly ---------- */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "clip";
}

// LLMs don't follow schemas perfectly. Coerce output so it always passes validation + renders:
// drop empty lines, fix bad layouts, downgrade data-blocks missing their required field, ensure captions.
const OK_LAYOUTS = ["lower-third", "center", "title", "stat", "quote", "bullets", "chart", "timeline", "meter", "nametag", "map", "compare"];
function sanitizeLines(lines, { language, longForm }) {
  const clean = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!l || typeof l.text !== "string" || !l.text.trim()) continue;
    const line = { text: l.text.trim() };
    line.keywords = Array.isArray(l.keywords) && l.keywords.length ? l.keywords.slice(0, 2).map(String) : deriveKeywords(l.caption || l.text);
    line.type = l.type === "video" ? "video" : "image";
    let layout = OK_LAYOUTS.includes(l.layout) ? l.layout : "lower-third";
    if (layout === "bullets" && !(Array.isArray(l.items) && l.items.length >= 2)) layout = "lower-third";
    else if (layout === "chart" && !(Array.isArray(l.chart) && l.chart.length >= 2)) layout = "lower-third";
    else if (layout === "timeline" && !(Array.isArray(l.events) && l.events.length >= 2)) layout = "lower-third";
    else if (layout === "stat" && !(l.stat && String(l.stat).trim())) layout = "lower-third";
    else if (layout === "nametag" && !(l.name && String(l.name).trim())) layout = "lower-third";
    else if (layout === "meter" && typeof l.percent !== "number") layout = "lower-third";
    else if (layout === "map" && !(l.location && String(l.location).trim())) layout = "lower-third";
    else if (layout === "compare" && !(l.compare && l.compare.left && l.compare.right)) layout = "lower-third";
    line.layout = layout;
    if (l.kicker) line.kicker = String(l.kicker);
    if (layout === "stat") line.stat = String(l.stat);
    if (layout === "quote" && l.cite) line.cite = String(l.cite);
    if (layout === "bullets") line.items = l.items.slice(0, 5).map(String);
    if (layout === "nametag") { line.name = String(l.name); if (l.role) line.role = String(l.role); }
    if (layout === "timeline") line.events = l.events.slice(0, 6);
    if (layout === "chart") line.chart = l.chart.slice(0, 6);
    if (layout === "meter") line.percent = Number(l.percent);
    if (layout === "map") { line.location = String(l.location); if (l.coords) line.coords = String(l.coords); }
    if (language !== "en") line.caption = l.caption && String(l.caption).trim() ? String(l.caption) : l.text;
    else if (l.caption) line.caption = String(l.caption);
    clean.push(line);
  }
  if (longForm && clean.length >= 6) {
    if (!clean.some((c) => c.layout === "center" || c.layout === "title")) clean[0].layout = "center";
    if (!clean.some((c) => c.kicker)) clean[0].kicker = "STORY";
  }
  return clean;
}

// LLMs sometimes nest the array under a different key — find it wherever it is.
function getLines(m) {
  if (!m) return [];
  for (const k of ["lines", "scenes", "script", "segments"]) if (Array.isArray(m[k])) return m[k];
  return [];
}

// If a line has no keywords, derive a varied, relevant search term from its own text
// (English text/caption) — never fall back to one fixed background for every scene.
const STOP = new Set("the a an and or but of to in on for with is are was were be been it its this that these those as at by from you your we our they their he she his her them how why what when who which will can could would has have had not no yes just very more most than then them into over about after before".split(" "));
function deriveKeywords(text) {
  const words = String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return words.length ? [words.slice(0, 4).join(" ")] : ["cinematic background"];
}

function finalizeMeta(model, cfg, topic, isShort, researchFile) {
  const platform = isShort ? (cfg.platform === "youtube-long" ? "reel" : cfg.platform) : cfg.platform;
  const spl = SEC_PER_LINE[platform] || 7;
  const lines = model.lines || [];
  return {
    title: model.title || topic,
    titleOptions: model.titleOptions || [],
    hashtags: model.hashtags || [],
    topic: topic || model.title || cfg.niche,
    niche: cfg.niche,
    channel: CHANNEL,
    platform,
    targetSeconds: Math.max(15, Math.round(lines.length * spl)),
    fps: 30,
    style: cfg.niche,
    voice: cfg.voice,
    voiceRate: cfg.voiceRate,
    pauseBetweenLinesSec: isShort ? 0.15 : 0.22,
    accentColor: cfg.accentColor,
    description: model.description || model.title || "",
    tags: model.tags && model.tags.length >= 3 ? model.tags : [cfg.niche, "shorts", "video"],
    researchFile: researchFile || "research.md",
    requireResearch: false,
  };
}

function giveEachLineAsset(lines, prefix) {
  const used = {};
  lines.forEach((l) => {
    const kw = (l.keywords && l.keywords[0]) || "clip";
    const base = `${prefix}_${slug(kw)}`;
    const n = used[base] || 0;
    used[base] = n + 1;
    l.asset = `${base}${n ? "_" + n : ""}.${l.type === "video" ? "mp4" : "jpg"}`;
  });
}

function writeJob(name, meta, lines) {
  giveEachLineAsset(lines, name);
  fs.writeFileSync(path.join(JOBS, `${name}.json`), JSON.stringify({ meta, lines }, null, 2));
  console.log(`  + jobs/${name}.json  (${lines.length} lines, ${meta.platform})`);
}

/* ---------- dry sample ---------- */
function drySample() {
  return {
    long: {
      title: "How This Works (Sample)", titleOptions: ["Sample A", "Sample B", "Sample C"],
      hashtags: ["sample", "test", "demo"], description: "A dry-run sample script for pipeline testing.",
      tags: ["sample", "test", "demo"],
      lines: [
        { text: "This is the opening hook of a sample video for testing.", keywords: ["city skyline night"], type: "video", layout: "center", kicker: "SAMPLE" },
        { text: "Here is a normal narration line explaining the first point clearly.", keywords: ["office desk"], type: "image", layout: "lower-third" },
        { text: "A striking number lands as a stat on screen for emphasis here.", keywords: ["money stacks"], type: "image", layout: "stat", stat: "$9B" },
        { text: "Another point continues the story with a clear single idea per line.", keywords: ["data network"], type: "video", layout: "lower-third" },
        { text: "A closing thought wraps the sample video on a strong final beat.", keywords: ["sunrise skyline"], type: "video", layout: "center" },
      ],
    },
    shorts: {
      shorts: [
        { title: "Sample Short One", lines: [
          { text: "A punchy hook opens this sample short strongly.", keywords: ["city night"], type: "video", layout: "center" },
          { text: "The key point delivered fast and clearly for a reel.", keywords: ["office"], type: "image", layout: "lower-third" },
          { text: "A final line that lands the payoff of the short.", keywords: ["sunrise"], type: "video", layout: "center" },
        ] },
      ],
    },
  };
}

/* ---------- main ---------- */
async function main() {
  if (!CHANNEL) { console.error("Set CHANNEL=syndar|cohortzero|farsight|til"); process.exit(1); }
  const cfg = loadConfig();
  // LANGUAGE dropdown override (English | Urdish | Hinglish). Picks language + the matching voice.
  const LANG = (process.env.LANGUAGE || "").toLowerCase();
  if (LANG.startsWith("urd") || LANG === "ur") {
    cfg.language = "ur";
    cfg.voice = "ur-PK-AsadNeural";
  } else if (LANG.startsWith("hing") || LANG === "hi") {
    cfg.language = "hi";
    cfg.voice = "hi-IN-MadhurNeural";
  } else if (LANG.startsWith("eng") || LANG === "en") {
    cfg.language = "en"; // keep the channel's English voice from config
  }
  fs.mkdirSync(JOBS, { recursive: true });
  const nichePack = readNichePack(cfg.niche);
  const isTIL = cfg.makeShorts === 0;
  // MODE: "long+shorts" (default) | "long" | "shorts". Shorts are always derived from the long.
  const MODE = (process.env.MODE || "long+shorts").toLowerCase();
  const writeLong = isTIL || MODE !== "shorts";
  const wantShorts = !isTIL && MODE !== "long" && cfg.makeShorts > 0;

  // 1) grounding
  let g = [];
  if (cfg.ground && TOPIC && !DRY) g = await ground(TOPIC);
  const research = ["# Research (auto-grounded)\n"];
  if (g.length) g.forEach((x) => research.push(`- ${x.title}: ${x.extract}\n  Source: ${x.url}`));
  else research.push("- (no external grounding — verify facts before publishing)");
  const researchFile = "research.md";
  fs.writeFileSync(path.join(JOBS, `${CHANNEL}.research.md`), research.join("\n"));

  const system = `You are an expert scriptwriter for a faceless, high-retention ${cfg.niche} video channel. You write factual, non-clickbait, production-grade scripts. ${RULES}${langRule(cfg.language)}`;

  // SHORTS-ONLY: write standalone reels DIRECTLY from the topic — no long video first.
  // One Groq call instead of two, so it's noticeably faster.
  if (!isTIL && MODE === "shorts") {
    const n = cfg.makeShorts || 3;
    const nativeSystem = `You are an expert scriptwriter for faceless, high-retention ${cfg.niche} vertical reels (YouTube Shorts / Instagram Reels). Each reel is a standalone, valuable ${cfg.niche} short that HOOKS hard in the very first line and pays it off by the last. ${RULES}${langRule(cfg.language)}`;
    const nativePrompt = `NICHE STYLE GUIDE:\n${nichePack}\n${groundingText(g)}\nTOPIC: ${TOPIC || "(you choose a strong, specific topic in this niche)"}\nWrite ${n} DIFFERENT standalone reels on this topic — each a distinct angle/hook, not variations of the same one.\nReturn JSON: { "shorts": [ { "title": string, "titleOptions": string[3], "hashtags": string[5], "description": string, "tags": string[3], "lines": [6-9 punchy lines in the shape above] } x${n} ] }`;
    let written = 0;
    let shortsModel;
    try {
      shortsModel = DRY ? drySample().shorts : await callGroq(nativeSystem, nativePrompt);
    } catch (e) {
      console.error(`Shorts generation failed: ${e.message}`);
      shortsModel = { shorts: [] };
    }
    (shortsModel.shorts || []).forEach((sh, i) => {
      const shl = sanitizeLines(getLines(sh), { language: cfg.language, longForm: false });
      const meta = finalizeMeta({ ...sh, lines: shl }, cfg, sh.title || TOPIC, true, researchFile);
      if (shl.length >= 3) { writeJob(`${CHANNEL}_short_${i + 1}`, meta, shl); written++; }
    });
    if (written === 0) {
      console.error("Groq returned no usable shorts. The free model can be flaky — just re-run.");
      process.exit(1);
    }
    console.log(`\nDone (${written} short${written > 1 ? "s" : ""}, no long). Render with:  npm run batch -- --only=${CHANNEL}\n`);
    return;
  }

  // 2) long (or TIL single short)
  const lineTarget = isTIL ? "8-11 short punchy" : "30-42";
  const funnel = cfg.funnel ? `\nEnd with a final line that is a soft CTA: "${cfg.funnel}"` : "";
  const longPrompt = `NICHE STYLE GUIDE:\n${nichePack}\n${groundingText(g)}\nTOPIC: ${TOPIC || "(you choose a strong, specific topic in this niche)"}\nWrite ${lineTarget} lines.${funnel}\nReturn the JSON now.`;

  let written = 0;
  const longModel = DRY ? drySample().long : await callGroq(system, longPrompt);
  const longLines = sanitizeLines(getLines(longModel), { language: cfg.language, longForm: !isTIL });
  const longMeta = finalizeMeta({ ...longModel, lines: longLines }, cfg, TOPIC, isTIL, researchFile);
  if (writeLong && longLines.length) { writeJob(CHANNEL, longMeta, longLines); written++; }

  // 3) script-aware shorts (derived FROM the long; only for long-form channels)
  if (wantShorts) {
    const shortsSystem = `You turn a long video script into short vertical reels. Pick the ${cfg.makeShorts} MOST hook-worthy, self-contained, valuable moments from the script and rewrite each as a punchy standalone reel. Do NOT cut randomly — choose the segments that hook and deliver value. ${RULES}${langRule(cfg.language)}`;
    const shortsPrompt = `Here is the long script's lines:\n${JSON.stringify((longModel.lines || []).map((l) => l.text || l.caption))}\nReturn JSON: { "shorts": [ { "title": string, "titleOptions": string[3], "hashtags": string[5], "description": string, "tags": string[3], "lines": [6-9 punchy lines as in the shape] } x${cfg.makeShorts} ] }`;
    let shortsModel;
    try {
      shortsModel = DRY ? drySample().shorts : await callGroq(shortsSystem, shortsPrompt);
    } catch (e) {
      console.log(`  ! shorts generation failed (${e.message}) — long video still produced.`);
      shortsModel = { shorts: [] };
    }
    (shortsModel.shorts || []).forEach((sh, i) => {
      const shl = sanitizeLines(getLines(sh), { language: cfg.language, longForm: false });
      const meta = finalizeMeta({ ...sh, lines: shl }, cfg, sh.title || TOPIC, true, researchFile);
      if (shl.length >= 3) { writeJob(`${CHANNEL}_short_${i + 1}`, meta, shl); written++; }
    });
  }

  // Never leave the render step with nothing: fall back to the long, or fail loudly.
  if (written === 0 && longLines.length) {
    writeJob(CHANNEL, longMeta, longLines);
    written++;
    console.log("  (fallback) wrote the long video since no shorts were produced");
  }
  if (written === 0) {
    console.error("Groq returned no usable content. The free model can be flaky — just re-run.");
    process.exit(1);
  }

  console.log(`\nDone. Render with:  npm run batch -- --only=${CHANNEL}\n`);
}

main().catch((e) => { console.error("generate_script failed:", e.message); process.exit(1); });
