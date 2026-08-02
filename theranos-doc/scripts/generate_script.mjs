/**
 * AUTO-WRITER: turn a channel (+ optional topic) into ready-to-render job files, using a
 * FREE Groq model. Anti-hallucination via a multi-source research pass (see lib_research.mjs:
 * query-expansion -> Wikipedia + DuckDuckGo (+ Hacker News) -> synthesized brief).
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
import { research } from "./lib_research.mjs";

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
  "thumb": { "line1": string, "line2": string, "sub": string },
  "lines": [ { "text": string, "caption"?: string, "keywords": string[1-2],
    "type": "image"|"video", "layout": "lower-third"|"center"|"title"|"stat"|"quote"|"bullets"|"nametag"|"timeline"|"chart"|"meter",
    "kicker"?: string, "stat"?: string, "cite"?: string, "items"?: string[], "name"?: string, "role"?: string,
    "events"?: [{ "label": string, "text": string }], "percent"?: number } ] }
RULES:
- One idea per line. The HOOK (line 1) and the big emphasis cards ("center"/"title" layouts) are
  short and punchy. But EVERY OTHER line must be a COMPLETE, informative sentence of 14-24 words that
  actually explains or reveals something concrete — NOT a slogan, headline, or 3-5 word fragment.
  A video made of short punchy fragments looks cheap and low-value; full, substantive sentences with
  specifics are what make it worth watching. Every line must earn the next.
- HOOK (line 1) is everything: open with a scroll-stopping hook — a surprising fact, a bold claim, a
  sharp question, or a "you've been doing X wrong" reversal. NO throat-clearing, no "in this video",
  no "have you ever wondered". Make the viewer NEED the next line in the first 3 seconds.
- RETENTION: plant open loops ("but there's a catch…", "and that's where it gets strange…") and pay
  them off later. Tease what's coming. Cut every filler sentence. No fluff, no repetition, no summary
  of what you just said.
- SPECIFICITY beats everything: use concrete names, real numbers, dates, places, and examples — never
  vague generalities ("many people", "a lot of money"). Specifics are what separate a real video from
  generic AI slop. Only use facts supported by the grounding; do not invent statistics.
- STRUCTURE: hook -> quick context -> escalating points/story with tension -> the payoff/insight ->
  a short, natural CTA. For long-form, build in mini-cliffhangers so retention doesn't sag mid-video.
- TITLE must be rank-fast: keyword + curiosity + specificity, ideally with a number or a bold promise.
  titleOptions = genuinely different angles, not reworded copies.
- DESCRIPTION = a real SEO YouTube description, 150-250 words in 2-3 short paragraphs. The FIRST
  sentence is a keyword-rich hook (it shows in search results), then naturally weave in the main
  keyword + related search terms a viewer would type, and end with a question or CTA. Plain text, no
  hashtags inside it.
- hashtags = 5-8 SPECIFIC, relevant tags (mix one or two broad with several niche ones). tags = 10-15
  SEO keyword phrases people actually search.
- Spell numbers/symbols for TTS ("nine billion", not "$9B"); put "$9B" only in a stat/caption field.
- Use a MIX of layouts (this is what makes it look produced, not generic AI): mostly lower-third,
  but a "center" or "title" for the hook and big statements, at least one "stat", a "nametag" if a
  person matters, one "bullets", and a "kicker" label on the first line of each act/section (these
  also become the video's chapters, so make them short and descriptive).
- keywords = concrete stock-footage search terms (e.g. "rocket launch night").
- thumb = the YouTube THUMBNAIL text, built for clicks: line1 + line2 are each 1-3 BIG punchy words
  (a curiosity gap or bold claim, NOT the full title — e.g. "INDEX FUNDS" / "BEAT THE PROS"), and
  "sub" is a short 3-6 word hook. High-contrast, provocative but not false.`;

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

// Coerce a token list into a clean string array. The free model sometimes returns tags/hashtags as
// a single comma-separated STRING instead of an array — which then fails the validator's
// Array.isArray check. Split it, strip '#', drop blanks, and cap the count (no tag-stuffing).
function toArr(v, max) {
  let a = v;
  if (typeof a === "string") a = a.split(/[,;#\n]+/);
  if (!Array.isArray(a)) a = [];
  a = a.map((x) => String(x).trim().replace(/^#+/, "")).filter(Boolean);
  return max ? a.slice(0, max) : a;
}

function finalizeMeta(model, cfg, topic, isShort, researchFile) {
  const platform = isShort ? (cfg.platform === "youtube-long" ? "reel" : cfg.platform) : cfg.platform;
  const spl = SEC_PER_LINE[platform] || 7;
  const lines = model.lines || [];
  const tags = toArr(model.tags, 15);
  return {
    title: model.title || topic,
    titleOptions: Array.isArray(model.titleOptions) ? model.titleOptions : [],
    hashtags: toArr(model.hashtags, 12),
    topic: topic || model.title || cfg.niche,
    niche: cfg.niche,
    channel: CHANNEL,
    platform,
    // Long-form is authored to the channel's intended length (config targetSeconds). Shorts stay
    // sized to their own line count.
    targetSeconds: isShort
      ? Math.max(15, Math.round(lines.length * spl))
      : (cfg.targetSeconds || Math.max(60, Math.round(lines.length * spl))),
    fps: 30,
    style: cfg.niche,
    voice: cfg.voice,
    voiceRate: cfg.voiceRate,
    kokoroVoice: cfg.kokoroVoice || "am_michael",
    language: cfg.language || "en",
    brand: cfg.brand || CHANNEL.toUpperCase(),
    tagline: cfg.tagline || "",
    links: cfg.links || null,
    disclaimer: cfg.disclaimer || "",
    thumbStyle: cfg.thumbStyle || "",
    thumb: model.thumb && model.thumb.line1 ? model.thumb : null,
    pauseBetweenLinesSec: isShort ? 0.15 : 0.22,
    accentColor: cfg.accentColor,
    description: model.description || model.title || "",
    tags: tags.length >= 3 ? tags : [cfg.niche, "shorts", "video"],
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
  if (!CHANNEL) { console.error("Set CHANNEL=syndar|cohortzero|equitier|til"); process.exit(1); }
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
  // "How many shorts" dropdown -> override the channel's default shorts-per-topic count.
  // Guarded to channels that make shorts, so TIL (makeShorts 0) is never turned into a multi-short.
  const nShorts = parseInt(process.env.SHORTS || "", 10);
  if (!Number.isNaN(nShorts) && nShorts >= 1 && nShorts <= 10 && cfg.makeShorts > 0) {
    cfg.makeShorts = nShorts;
  }
  fs.mkdirSync(JOBS, { recursive: true });
  const nichePack = readNichePack(cfg.niche);
  const isTIL = cfg.makeShorts === 0;
  // MODE: "long+shorts" | "long" | "shorts".  (TIL defaults to "shorts"; other channels to "long+shorts".)
  //   long / long+shorts -> write a long script (long+shorts also derives shorts FROM it).
  //   shorts             -> write vertical reels DIRECTLY (no long is generated) — faster, fewer tokens.
  const MODE = (process.env.MODE || (isTIL ? "shorts" : "long+shorts")).toLowerCase();
  const longMode = MODE === "long" || MODE === "long+shorts";
  // TIL normally makes ONE punchy short. It only becomes a long-form channel when you explicitly
  // pick long / long+shorts — then it behaves like the others (youtube-long + 3 derived shorts).
  const tilShort = isTIL && !longMode;
  if (isTIL && longMode) { cfg.platform = "youtube-long"; cfg.makeShorts = 3; }
  const shortsOnly = !tilShort && MODE === "shorts" && cfg.makeShorts > 0;
  const writeLong = tilShort || MODE === "long" || MODE === "long+shorts";
  const wantDerivedShorts = !tilShort && MODE === "long+shorts" && cfg.makeShorts > 0;

  // How many scenes a long needs to actually reach its target length. Snappy voices run ~4.8s per
  // line (incl. the inter-line pause), so a 4-min (240s) long needs ~50 lines, a 5-min one ~63.
  const LONG_SEC_PER_LINE = 4.8;
  const neededLong = Math.max(34, Math.ceil((cfg.targetSeconds || 240) / LONG_SEC_PER_LINE));

  // TOPICS: a batch queue — one topic PER VIDEO. Enter several (one per line, or separated by
  // ";" / "|") and each becomes its own video (long) or its own set of reels (shorts). Falls back
  // to the single TOPIC env, or "" (the channel auto-picks). Queue 5, sleep, wake up to 5 videos.
  const rawTopics = (process.env.TOPICS || TOPIC || "").trim();
  const topics = rawTopics
    ? rawTopics.split(/[\n;|]+/).map((t) => t.trim()).filter(Boolean)
    : [""];
  const multi = topics.length > 1;
  const researchFile = "research.md";

  const system = `You are an expert scriptwriter for a faceless, high-retention ${cfg.niche} video channel. You write factual, non-clickbait, production-grade scripts. ${RULES}${langRule(cfg.language)}`;

  console.log(`Channel ${CHANNEL} | mode ${MODE} | ${topics.length} topic(s) queued`);
  let totalWritten = 0;

  for (let ti = 0; ti < topics.length; ti++) {
    const topic = topics[ti];
    // Job name prefix. Single topic -> just the channel (unchanged, backward compatible).
    // Multiple topics -> channel_NN_<topic-slug>, still starting with the channel so
    // `--only=<channel>` and the `out/<channel>*` delivery glob both still match every job.
    const prefix = multi
      ? `${CHANNEL}_${String(ti + 1).padStart(2, "0")}_${slug(topic)}`.slice(0, 60)
      : CHANNEL;
    if (multi) console.log(`\n--- [${ti + 1}/${topics.length}] ${topic} -> ${prefix} ---`);

    // RESEARCH (per topic): expand into sub-questions, pull from Wikipedia + DuckDuckGo (+ Hacker
    // News for tech), synthesize a brief. Best-effort — never blocks or breaks generation.
    let g = [];
    if (cfg.ground && topic && !DRY) {
      try {
        const R = await research(topic, { niche: cfg.niche });
        g = R.items || [];
        if (g.length) console.log(`  research: ${g.length} facts from ${R.queries.length} sub-queries`);
      } catch (e) {
        console.log(`  ! research failed (${e.message}) — writing without grounding.`);
      }
    }
    const researchLines = ["# Research (auto)\n"];
    if (g.length) g.forEach((x) => researchLines.push(`- ${x.title ? x.title + ": " : ""}${x.extract}${x.url ? "\n  Source: " + x.url : ""}`));
    else researchLines.push("- (no external grounding — verify facts before publishing)");
    fs.writeFileSync(path.join(JOBS, `${prefix}.research.md`), researchLines.join("\n"));

    let written = 0;

    if (shortsOnly) {
      // SHORTS-ONLY: write standalone reels DIRECTLY from the topic — no long video first.
      const n = cfg.makeShorts || 3;
      const nativeSystem = `You are an expert scriptwriter for faceless, high-retention ${cfg.niche} vertical reels (YouTube Shorts / Instagram Reels). Each reel is a standalone, valuable ${cfg.niche} short that HOOKS hard in the very first line and pays it off by the last. ${RULES}${langRule(cfg.language)}`;
      const nativePrompt = `NICHE STYLE GUIDE:\n${nichePack}\n${groundingText(g)}\nTOPIC: ${topic || "(you choose a strong, specific topic in this niche)"}\nWrite ${n} DIFFERENT standalone reels on this topic — each a distinct angle/hook, not variations of the same one.\nReturn JSON: { "shorts": [ { "title": string, "titleOptions": string[3], "hashtags": string[5], "description": string, "tags": string[3], "lines": [6-9 punchy lines in the shape above] } x${n} ] }`;
      let shortsModel;
      try {
        shortsModel = DRY ? drySample().shorts : await callGroq(nativeSystem, nativePrompt);
      } catch (e) {
        console.error(`  ! shorts generation failed (${e.message}).`);
        shortsModel = { shorts: [] };
      }
      (shortsModel.shorts || []).forEach((sh, i) => {
        const shl = sanitizeLines(getLines(sh), { language: cfg.language, longForm: false });
        const meta = finalizeMeta({ ...sh, lines: shl }, cfg, sh.title || topic, true, researchFile);
        if (shl.length >= 3) { writeJob(`${prefix}_short_${i + 1}`, meta, shl); written++; }
      });
    } else {
      // LONG (or TIL single short), plus derived shorts for long+shorts mode.
      const funnel = cfg.funnel ? `\nEnd with a final line that is a soft CTA: "${cfg.funnel}"` : "";
      const minutes = Math.max(2, Math.round((cfg.targetSeconds || 240) / 60));
      const longPrompt = tilShort
        ? `NICHE STYLE GUIDE:\n${nichePack}\n${groundingText(g)}\nTOPIC: ${topic || "(you choose a strong, specific topic in this niche)"}\nWrite 8-11 short punchy lines.${funnel}\nReturn the JSON now.`
        : `NICHE STYLE GUIDE:\n${nichePack}\n${groundingText(g)}\nTOPIC: ${topic || "(you choose a strong, specific topic in this niche)"}\nWrite a COMPLETE, in-depth ${minutes}-minute script: about ${neededLong} lines/scenes, one clear idea per line. Do NOT stop early, summarize, or skip the middle — develop the full story/analysis with specifics and examples.${funnel}\nReturn the JSON now.`;

      const longModel = DRY ? drySample().long : await callGroq(system, longPrompt);
      let rawLong = getLines(longModel);

      // The free model routinely under-delivers on length (you asked for 50 lines, it wrote 18).
      // Keep adding DISTINCT scenes until the long is actually long enough for the target duration.
      // Capped at 3 extra passes so a flaky model can never loop forever.
      let expand = 0;
      while (!DRY && !tilShort && rawLong.length < Math.floor(neededLong * 0.9) && expand < 3) {
        const have = rawLong.map((l) => l.text || l.caption).filter(Boolean);
        const addN = Math.min(20, neededLong - rawLong.length);
        const expandPrompt = `You are continuing a ${cfg.niche} long-form video script on TOPIC: ${topic || cfg.niche}.\nScenes already written (DO NOT repeat any of these):\n${JSON.stringify(have)}\nAdd ${addN} MORE distinct, valuable scenes that move the story/analysis forward, in the SAME JSON line shape. Return { "lines": [ ... ] } only.`;
        let more;
        try { more = await callGroq(system, expandPrompt); } catch { break; }
        const moreLines = getLines(more);
        if (!moreLines.length) break;
        rawLong = rawLong.concat(moreLines);
        expand++;
      }
      // Drop empty + repeated scenes so the validator's no-duplicate gate can never fail the long.
      const seenLong = new Set();
      rawLong = rawLong.filter((l) => {
        const k = String((l && (l.text || l.caption)) || "").trim().toLowerCase();
        if (!k || seenLong.has(k)) return false;
        seenLong.add(k);
        return true;
      });
      longModel.lines = rawLong; // derived shorts should pull from the FULL expanded script

      const longLines = sanitizeLines(rawLong, { language: cfg.language, longForm: !tilShort });
      const longMeta = finalizeMeta({ ...longModel, lines: longLines }, cfg, topic, tilShort, researchFile);
      if (!tilShort) console.log(`  long: ${longLines.length} scenes (aim ~${neededLong} for ~${minutes} min)`);
      if (writeLong && longLines.length) { writeJob(prefix, longMeta, longLines); written++; }

      if (wantDerivedShorts) {
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
          const meta = finalizeMeta({ ...sh, lines: shl }, cfg, sh.title || topic, true, researchFile);
          if (shl.length >= 3) { writeJob(`${prefix}_short_${i + 1}`, meta, shl); written++; }
        });

        // Never leave the render step with nothing: fall back to the long.
        if (written === 0 && longLines.length) {
          writeJob(prefix, longMeta, longLines);
          written++;
          console.log("  (fallback) wrote the long video since no shorts were produced");
        }
      }
    }

    if (written === 0) console.error(`  ! no usable content for topic "${topic || "(auto)"}" — skipped.`);
    totalWritten += written;
  }

  if (totalWritten === 0) {
    console.error("Groq returned no usable content for any topic. The free model can be flaky — just re-run.");
    process.exit(1);
  }

  console.log(`\nDone. ${totalWritten} job(s) across ${topics.length} topic(s). Render with:  npm run batch -- --only=${CHANNEL}\n`);
}

main().catch((e) => { console.error("generate_script failed:", e.message); process.exit(1); });
