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
import { speakFix, urduGlue } from "./speakfix.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The creator's input can mix FACTS with DIRECTIONS ("make the tone funny", "start with this hook",
// "add this line") — split below by the brief reader; `paragraph` becomes the trusted SOURCE text.
let paragraph = (process.env.PARAGRAPH || "").trim();
if (paragraph.length < 30) throw new Error("PARAGRAPH is empty/too short — paste what the video is about.");
const style = process.env.STYLE || "explainer";
const day = Number(process.env.DAY || 0) || null;
const theme = process.env.THEME && process.env.THEME !== "job" ? process.env.THEME : "crimson";
// Channel brand is OPTIONAL: with no HANDLE the reel carries no handle/logo — just a "Follow" prompt.
const handle = (process.env.HANDLE || "").trim();
// Channel brand mark (public/ path). Cohort Zero's original logo lives in cohort_zero/02_Brand_Assets/logos
// and is copied to public/brand/cohortzero-mark.png; other channels pass LOGO.
const logo = process.env.LOGO || (handle === "@cohort_zero" ? "brand/cohortzero-mark.png" : "");
const verbatimInput = /^(yes|true|1)$/i.test(process.env.VERBATIM || "");
const briefReport = []; // what the brief stages did, shown in the run summary
// LANGUAGE: english (default) | urdu. Urdu reels: the voice reads Urdu SCRIPT (English tech words kept
// in English) while the screen + captions show ROMAN Urdu — how Pakistani Gen-Z actually types.
const language = (process.env.LANGUAGE || "english").toLowerCase() === "urdu" ? "urdu" : "english";
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
  // closing quotes (incl. curly ” ’ ») stay with their sentence — a line once started with a stray ”
  const sentences = script.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["'”’»)\]]*|[^.!?]+$/g) || [script];
  // a piece starting lowercase continues the previous sentence (e.g. after a quoted "...early?” to Pakistan's...")
  const joined = [];
  for (const x of sentences.map((x) => x.trim()).filter(Boolean)) {
    if (joined.length && /^[a-z]/.test(x)) joined[joined.length - 1] += " " + x;
    else joined.push(x);
  }
  return joined.flatMap((x) => splitLong(x.split(" ")));
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

/* ═════════════ STAGE 0a — EDITOR NOTES: words addressed to us, not to the viewer ═════════════
 * Creators paste things like "i am giving you the script, make it as it is, no change" or a ChatGPT
 * preamble ("Here's the Gen Z version of that paragraph:") in front of the script. Those must never be
 * spoken. The LLM only POINTS at such spans (exact substrings); we delete them ourselves, so the script
 * itself can never be rewritten here. "No change / as it is" also switches on verbatim mode. */
let verbatim = verbatimInput;
{
  try {
    const notes = await groqJSON(
      `The creator pasted text for a narrated video. Find spans addressed to the EDITOR / AI / tool rather than spoken to the viewer: meta-instructions ("i am giving you the script", "make it as it is", "no change in script", "this is voice script", "make the tone funny"), chatbot preambles/labels ("Here's the Gen Z version of that paragraph (scroll-stopping, TikTok ready):", "Script:"). The story/facts themselves and lines meant to be spoken are NOT notes — even casual ones like "Bro this story is insane".
Copy each note span EXACTLY as written (same characters). Set keep_exact true only if the creator asks to keep their script unchanged / as it is / word for word.
Return ONLY JSON: {"notes":["exact span", ...],"keep_exact":true|false}`,
      paragraph.slice(0, 8000),
      { maxTokens: 800, temperature: 0 },
    );
    let cut = paragraph;
    const removed = [];
    for (const n of (notes?.notes || []).map((x) => String(x).trim()).filter((x) => x.length >= 4)) {
      const k = cut.toLowerCase().indexOf(n.toLowerCase());
      if (k < 0) continue;
      cut = (cut.slice(0, k) + " " + cut.slice(k + n.length)).trim();
      removed.push(n);
    }
    cut = cut.replace(/^[\s:*\-–—)]+/, "").replace(/[\s(:]+$/, "").trim();
    // a stray ")" left over from a "(...)" preamble
    if ((cut.match(/\)/g) || []).length > (cut.match(/\(/g) || []).length) cut = cut.replace(/\)\s*$/, "").trim();
    if (removed.length && cut.length >= paragraph.length * 0.5 && cut.length >= 40) {
      paragraph = cut;
      console.log(`  editor notes removed (never spoken): ${removed.map((r) => `"${r.slice(0, 60)}"`).join(" · ")}`);
      briefReport.push(`removed your note(s) to the editor: ${removed.map((r) => `"${r.slice(0, 50)}"`).join(", ")}`);
    }
    if (notes?.keep_exact === true && !verbatim) {
      verbatim = true;
      console.log("  creator asked for no changes → verbatim mode");
      briefReport.push("kept your script as-is (you asked for no changes)");
    }
  } catch (e) {
    console.warn(`  editor-notes pass failed (${e.message}) — using the text as given`);
  }
}

/* ═════════════ STAGE 0 — BRIEF READER: facts vs the creator's directions ═════════════ */
let directionsText = "";
if (!verbatim) {
  const brief = await groqJSON(
    `You read a content creator's brief for a short video. It may be pure facts, or facts mixed with instructions to the editor.
Split it. Return ONLY JSON:
{"facts":"ALL factual/story content, copied word-for-word (do not summarize, rephrase or drop anything factual)",
 "tone":"requested tone/mood or \"\"",
 "hook":"an opening line the creator wants (exact wording) or \"\"",
 "must_include":["exact lines/phrases the creator wants in the script"],
 "structure":"requested structure/ending/pacing or \"\"",
 "length":"requested length or \"\"",
 "other":"any other instruction or \"\""}
If there are no instructions, "facts" is the whole input and the rest are empty.`,
    paragraph.slice(0, 8000),
    { maxTokens: 2500, temperature: 0 },
  );
  const facts = String(brief?.facts || "").trim();
  const must = (Array.isArray(brief?.must_include) ? brief.must_include : []).map((x) => String(x).trim()).filter(Boolean);
  const hookWanted = String(brief?.hook || "").trim();
  const dir = [
    brief?.tone && `TONE: ${brief.tone}`,
    hookWanted && `HOOK: line 1 MUST be the creator's hook — keep its meaning and key words, polish only for flow: "${hookWanted}"`,
    must.length && `MUST INCLUDE (use these lines/phrases, near-verbatim): ${must.map((m) => `"${m}"`).join("; ")}`,
    brief?.structure && `STRUCTURE: ${brief.structure}`,
    brief?.length && `LENGTH: ${brief.length}`,
    brief?.other && `ALSO: ${brief.other}`,
  ].filter(Boolean);
  if (facts.length >= 20 && (dir.length || facts.length < paragraph.length * 0.9)) {
    // Source = the facts + the creator's own words (their hook / must-include lines are trusted, not "invented").
    paragraph = [facts, hookWanted, ...must].filter(Boolean).join("\n");
    directionsText = dir.length ? `\nCREATOR DIRECTIONS — follow these exactly; they override the default style rules:\n- ${dir.join("\n- ")}\n` : "";
    briefReport.push(dir.length ? dir.map((d) => d.split(":")[0].replace(/\(.*$/, "").trim()).join(", ").toLowerCase() : "none");
    console.log(`  brief: ${dir.length} direction(s) — ${briefReport.at(-1)}`);
  }
}

const writerSystem = `You are the head WRITER of a premium Instagram Reels studio (Gen-Z audience${handle ? `; brand ${handle}` : ""}).
${verbatim ? "The creator already wrote the script. Keep every line EXACTLY as given; your job is to tag each line and write hooks." : "Turn the SOURCE into a 25-45 second spoken script."}
Return ONLY JSON:
{"facts":[every concrete fact in the SOURCE: numbers, dates, names, places — copied, not invented],
 "hooks":[{"text":"…","type":"curiosity|contrarian|pov|number|stakes","score":1-10}] (exactly 3, max 12 words each, different types),
 "chosen": index of the best hook,
 "lines":[{"text":"${language === "urdu" ? "the line in ROMAN Urdu (Latin letters) mixed with English, as shown on screen" : "spoken line"}","intent":one of [${INTENT_LIST.join(", ")}],"energy":1|2|3,"visual":"what the viewer should SEE (max 12 words)"}],
 "subject": "2-4 ENGLISH words naming what this reel is about, for stock-footage search and checks (e.g. 'Taj Mahal Agra', 'stock market trading', 'Apollo moon landing')",
 "mood": one of [mystery, ancient, reflective, science, tension, awe, epic, future, modern, sci-fi, calm, uplifting] — the music mood of the whole reel,
 "caption":"1-2 short lines + a question that drives comments + 5 hashtags"}
${language === "urdu" ? `LANGUAGE: "Urdish" for a Pakistani Gen-Z audience — MOSTLY ENGLISH. Every noun, technical term and content word stays in English (computer, RAM, memory, wire, landing, software, mission, astronauts, Moon, years, blocks…). Urdu is ONLY the simple glue and everyday phrases: hai, tha, the, ye, wo, aur, ke, ki, ka, ko, se, mein, pe, par, bhi, toh, nahi, kya, sirf, phir, "kya aapko pata hai", "ye hua", "wo hua", "socho". Never formal or difficult Urdu words. Example: "1969 mein Apollo 11 ne two astronauts ko Moon pe land kiya. Kya aapko pata hai, computer mein sirf 4 KB RAM thi?" "text" is written in Latin letters like that — the voice version is made in a later step. Hooks, caption and visuals follow the same style.
` : ""}SCRIPT RULES${verbatim ? " (tagging only — do not change text)" : ""}:
- ${verbatim ? "One entry in lines per given segment, same order, identical text." : "9-13 lines. Line 1 = the chosen hook. Each line ONE idea, 5-14 words, " + (language === "urdu" ? "spoken casual Roman Urdu with English tech words" : "spoken casual English (contractions, 'you')") + ", no emojis/markdown."}
- ${verbatim ? "" : "Structure: hook (open loop) → context → 3-6 escalating facts/turns (a pattern interrupt every ~3 lines: question, myth, 'but here's the thing') → payoff → takeaway. Do NOT write a follow/CTA line; it is added automatically."}
- intent = what the line IS: a date → "date", a location → "place", a person → "person", a big number → "bigNumber", two things side by side → "comparison", steps → "process", A causes B → "causeEffect", a study → "research", a misconception → "myth", hidden info → "secret", a ranking/set → "list", how it changed → "change", a tech mechanism → "tech". Use "fact"/"lesson" only when nothing more specific fits. Vary intents.
- Every line must ADD something new (a fact, a turn, a consequence). Never restate or paraphrase an earlier line.
- The hook leads with the single most surprising fact or tension in the SOURCE.
- energy: 3 hook/reveals/wins, 2 explanation, 1 reflective. Never three 1s in a row.
FACTS (strict): every number, date, name, place, material, weight, cause and "that's why" reason in the script must come from the SOURCE. Do NOT add outside knowledge — even well-known true facts. Never invent statistics, quotes, studies or sources. Make it gripping through framing, questions and pacing, not extra facts.
STYLE: ${STYLES[style] || STYLES.explainer}${directionsText}`;
const segments = verbatim ? segment(paragraph).slice(0, 24) : [];
const writerUser = verbatim ? `SCRIPT SEGMENTS:\n${segments.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : `SOURCE:\n"""${paragraph.slice(0, 6000)}"""`;

console.log("① WRITER…");
let written = await groqJSON(writerSystem, writerUser, { maxTokens: 3500, temperature: 0.8 });
if (!written || !Array.isArray(written.lines) || !written.lines.length) throw new Error("Writer returned no script lines.");
let lines = written.lines.slice(0, verbatim ? 24 : 14).map((l) => ({
  text: clean(l?.text),
  ...(language === "urdu" && clean(l?.speak) ? { speak: clean(l.speak) } : {}),
  intent: INTENT_LIST.includes(l?.intent) ? l.intent : "fact",
  energy: [1, 2, 3].includes(Number(l?.energy)) ? Number(l.energy) : 2,
  visual: clean(l?.visual).slice(0, 120),
}));
if (verbatim) lines = segments.map((text, i) => ({ ...(lines[i] || { intent: "fact", energy: 2, visual: "" }), text }));
lines = lines.filter((l) => l.text);
const hooks = (written.hooks || []).map((h) => (typeof h === "string" ? { text: h } : h)).filter((h) => h?.text).slice(0, 3);
let chosen = Math.min(Math.max(0, Number(written.chosen) || 0), Math.max(0, hooks.length - 1));
lines[0].energy = 3;
if (!verbatim) lines[0].intent = lines[0].intent === "fact" ? "hook" : lines[0].intent;
console.log(lines.map((l, i) => `  ${i + 1}. [${l.intent}] ${l.text}`).join("\n"));

/* ═════════════ STAGE 1b — FACT-CHECKER ═════════════
 * The writer sometimes "helps" with outside knowledge ("each block weighs over a ton"). For a facts
 * channel every claim must come from the SOURCE, so a separate strict pass checks each line and
 * rewrites unsupported ones using only the source (verbatim mode: flag only, never change words). */
const checkerSystem = `You are a strict FACT-CHECKER for a factual short-video channel. For each numbered script line,
decide if every factual claim in it (numbers, dates, names, materials, causes, superlatives, "that's why" reasons)
is directly supported by the SOURCE. Style, questions, hooks and opinions without facts are fine.
Return ONLY JSON: {"lines":[{"i":n,"ok":true|false,"claim":"the unsupported part","fix":"the line rewritten using ONLY source facts, same tone and language, 5-14 words"${language === "urdu" ? ',"fix_speak":"the same fixed line in Urdu script, English words kept in English"' : ""}}]} — one entry per line.`;
const checkerUser = `SOURCE:
"""${paragraph.slice(0, 6000)}"""

SCRIPT:
${lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n")}`;
console.log("② FACT-CHECK…");
const checked = await groqJSON(checkerSystem, checkerUser, { maxTokens: 2500, temperature: 0.1 });
const factFixes = [];
for (const c of checked?.lines || []) {
  const k = Number(c?.i) - 1;
  if (!lines[k] || c?.ok !== false) continue;
  const fix = clean(c.fix);
  if (!verbatim && fix && fix.split(" ").length >= 3) {
    factFixes.push({ before: lines[k].text, after: fix, claim: clean(c.claim) });
    lines[k].text = fix;
    if (language === "urdu") { if (clean(c.fix_speak)) lines[k].speak = clean(c.fix_speak); else delete lines[k].speak; }
  } else {
    factFixes.push({ before: lines[k].text, after: null, claim: clean(c.claim) });
  }
}
if (factFixes.length) console.log(factFixes.map((f) => `  ✎ "${f.claim}" → ${f.after ? `"${f.after}"` : "(flagged)"}`).join("\n"));

/* ═════════════ STAGE 1c — URDU (language=urdu only) ═════════════
 * One big writer call won't reliably produce Urdu script alongside everything else, so Urdu is done
 * as two small focused passes on the already fact-checked lines:
 *   (a) make sure the on-screen text is casual ROMAN Urdu (translate if the writer drifted to English)
 *   (b) transliterate each line to Urdu SCRIPT for the voice ("speak"), English tech words kept in English.
 * If (b) still fails, the voice reads the Roman Urdu (OmniVoice handles it) — never an English reel. */
// Real Urdu LETTERS only — the Urdu comma "،" and full stop "۔" once let an all-Latin reply pass as "Urdu script".
const URDU_LETTERS = /[ء-غف-يٹ-ۓ]/;
const urduLetterCount = (t) => (String(t).match(/[ء-غف-يٹ-ۓ]/g) || []).length;
const ROMAN_URDU_WORDS = /\b(hai|hain|ka|ki|ke|aur|ye|yeh|woh|nahi|nahin|kya|mein|main|hum|aap|tha|thi|thay|se|ko|par|bhi|ek|jo|sab|kuch|kaise|kyun|liye|wala|wali|gaya|gayi|raha|rahi|karna|karte|kar|diya|hota|hoti)\b/gi;
const romanScore = (t) => (String(t).match(ROMAN_URDU_WORDS) || []).length;
const urduReport = [];
if (language === "urdu") {
  const englishLines = lines.map((l, i) => ({ i, t: l.text })).filter((x) => romanScore(x.t) < 1);
  if (englishLines.length) {
    console.log(`  ! ${englishLines.length}/${lines.length} lines are not Roman Urdu — translating`);
    const tr = await groqJSON(
      `Rewrite each numbered line in "Urdish": MOSTLY ENGLISH in Latin letters — keep every noun, technical and content word in English — with only simple Urdu glue words (hai, tha, ye, wo, aur, ke, ki, ka, ko, se, mein, pe, bhi, toh, nahi, kya, sirf) and everyday phrases ("kya aapko pata hai", "ye hua"). No formal Urdu. Keep the meaning and every fact exactly; do not add facts. 5-14 words each.
Return ONLY JSON: {"lines":[{"i":n,"text":"..."}]}`,
      englishLines.map((x) => `${x.i + 1}. ${x.t}`).join("\n"),
      { maxTokens: 2000, temperature: 0.3 },
    );
    for (const r of tr?.lines || []) {
      const k = Number(r?.i) - 1;
      if (lines[k] && romanScore(r?.text) >= 1) lines[k].text = clean(r.text);
    }
    // one retry, line by line, for anything still English
    for (const x of englishLines.filter((x) => romanScore(lines[x.i].text) < 1)) {
      const one = await groqJSON(
        `Rewrite this ONE line in "Urdish": mostly English words in Latin letters, plus simple Urdu glue words (hai, tha, ye, aur, ke, ki, ka, ko, se, mein, pe, bhi, nahi, kya, phir, unhone). Same meaning and facts. Return ONLY JSON: {"text":"..."}`,
        x.t,
        { maxTokens: 300, temperature: 0.1 },
      ).catch(() => null);
      if (romanScore(one?.text) >= 1) lines[x.i].text = clean(one.text);
    }
    const still = lines.filter((l) => romanScore(l.text) < 1).length;
    urduReport.push(`translated ${englishLines.length - still} English line(s) to Roman Urdu${still ? ` (${still} kept English)` : ""}`);
  }
  const transliterate = async (todo, temperature) => {
    const out = await groqJSON(
      `Prepare each numbered line for an Urdu text-to-speech voice: write ONLY the Urdu glue words (hai, tha, ye, wo, aur, ke, ko, se, mein, kya…) in Urdu script, and copy EVERY English word, name and number EXACTLY as it is in Latin letters/digits. Same words, same order — transliterate the Urdu words only, never translate English words into Urdu.
Example: "1969 mein Apollo 11 ne two astronauts ko Moon pe land kiya" → "1969 میں Apollo 11 نے two astronauts کو Moon پے land کیا"
Return ONLY JSON: {"lines":[{"i":n,"urdu":"..."}]}`,
      todo.map((k) => `${k + 1}. ${lines[k].text}`).join("\n"),
      { maxTokens: 2500, temperature },
    );
    for (const r of out?.lines || []) {
      const k = Number(r?.i) - 1;
      const u = String(r?.urdu || "");
      // accept only if the Roman glue words really became Urdu letters
      if (lines[k] && urduLetterCount(u) >= 2 && (romanScore(lines[k].text) === 0 || romanScore(u) < romanScore(lines[k].text))) lines[k].speak = clean(u);
    }
  };
  console.log("③ URDU SCRIPT (voice)…");
  await transliterate(lines.map((_, k) => k), 0.2);
  let missing = lines.map((l, k) => (l.speak ? -1 : k)).filter((k) => k >= 0);
  if (missing.length) await transliterate(missing, 0.1);
  missing = lines.map((l, k) => (l.speak ? -1 : k)).filter((k) => k >= 0);
  // Deterministic safety net: any Roman glue word the LLM left (or a whole line it skipped) is
  // written in Urdu script from a fixed dictionary, so the voice never reads "hai/mein" with English rules.
  // Then voice-only pronunciation: acronyms + numbers said in English (screen keeps "RAM", "1969").
  for (const l of lines) l.speak = speakFix(urduGlue(l.speak || l.text));
  const latinOnly = lines.filter((l) => romanScore(l.text) >= 1 && !URDU_LETTERS.test(l.speak)).length;
  urduReport.push(`${lines.length - missing.length}/${lines.length} lines voiced from AI Urdu script${missing.length ? ` (${missing.length} by the built-in glue-word dictionary)` : ""}${latinOnly ? ` · ${latinOnly} still Latin` : ""}`);
  console.log(`  ${urduReport.join(" · ")}`);
}

/* ═════════════ STAGE 2 — CASTING ═════════════ */
const cast = castCandidates({ lines, menu, docBias: style === "explainer", seed: Number(process.env.SEED) || paragraph.length });
if (style === "buildInPublic") cast[0].candidates = ["dayStamp", ...cast[0].candidates.filter((c) => c !== "dayStamp")];
if (style === "techNews") cast[0].candidates = ["newsBanner", ...cast[0].candidates.filter((c) => c !== "newsBanner")];
const allCands = [...new Set(cast.flatMap((c) => c.candidates))];

/* ═════════════ STAGE 3 — DIRECTOR ═════════════ */
const directorSystem = `You are the DIRECTOR / motion editor of a premium Gen-Z Instagram studio. For EACH script line choose the single best scene from THAT LINE'S candidates and fill its props.
Return ONLY JSON: {"beats":[{"i":line number,"primitive":id,"why":"max 8 words","emphasis":[1-2 words from the line],"bg":"2-4 word stock-footage search","props":{…}}]} — exactly one per line, in order.
BACKGROUND ("bg"): every line gets a real stock video behind it. Give a concrete, FILMABLE search a stock library will have (objects, places, textures, actions, moods) that matches the line — e.g. "pyramid desert sunset", "ancient stone blocks", "server room lights", "city night timelapse". Never names of people, brands or specific events; vary it every line.
Backgrounds must stay ON the reel's SUBJECT — never show a different place, landmark, era or object than the source is about (no Colosseum in a pyramid reel, no modern skyline in an ancient-history reel). For abstract lines, use a fresh angle of the main subject (close-up, texture, aerial, night, time-lapse).
CHOOSING: the scene must SHOW what the line SAYS (a date → time travel, a place → map lock, a comparison → true-scale or versus…). Prefer the richest, most cinematic option that fits; never pick the same id twice in the whole reel; avoid two plain-text scenes in a row.
PROPS: follow the schema exactly; on-screen strings are SHORT (titles ≤ 5 words, list items ≤ 4 words).${language === "urdu" ? " On-screen strings are in ROMAN Urdu (Latin letters) mixed with English, matching the script lines — never Urdu script on screen." : ""} Use ONLY facts from FACTS — never invent numbers, quotes, sources or names.
IMAGES (REQUIRED for parallax, archiveFilm, museumFrame, photo, thenNow, beforeAfter): always give "search": 2-5 words naming a REAL subject to find an archival/public-domain photo (e.g. "Apollo Guidance Computer", "Saturn V launch") AND a "prompt" fallback describing the scene visually (era, place, lighting; no text, no logos, no real living person's likeness). thenNow uses search/prompt for THEN and search2/prompt2 for NOW.
museumFrame is for a person, artifact or creature portrait (the subject itself), not for diagrams or processes. Never invent years, dates, sources or citations for any scene — leave those props out unless the FACTS contain them.
locate needs REAL coordinates (lat/lon numbers with sign). scaleCompare needs REAL relative sizes. Citations only if the source names them.`;
const scenesDoc = allCands.map((id) => { const m = byId.get(id); return `- ${id} [${m.category}]: ${m.description} PROPS: ${m.props}`; }).join("\n");
const directorUser = `FACTS:\n${(written.facts || []).map((f) => `- ${clean(f)}`).join("\n") || "- (none beyond the script)"}

SCRIPT (line → its candidates):
${lines.map((l, i) => `${i + 1}. [${l.intent}, energy ${l.energy}] "${l.text}"  (writer's visual idea: ${l.visual || "—"})\n   candidates: ${cast[i].candidates.join(", ")}`).join("\n")}

SCENE SCHEMAS:
${scenesDoc}`;

console.log("④ DIRECTOR…");
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
  if (l.speak) beat.speak = l.speak;
  if (Array.isArray(d.emphasis) && d.emphasis.length) beat.emphasis = d.emphasis.slice(0, 2).map(clean);
  if (d.props && typeof d.props === "object" && !Array.isArray(d.props) && primitive === d.primitive) beat.props = d.props;
  if (d.why) beat.why = clean(d.why);
  if (d.bg) beat.bg = clean(d.bg).slice(0, 60);
  return beat;
});
if (style === "buildInPublic" && day) {
  const ds = beats.find((b) => b.primitive === "dayStamp");
  if (ds) ds.props = { ...(ds.props || {}), day };
}
// End card is VISUAL only — no spoken "follow for more" line (creator's call): just the Follow prompt.
const cta = style === "buildInPublic" ? `Follow for Day ${(day ?? 1) + 1}` : "Follow";
beats.push({ text: "", primitive: "outro", energy: 1, props: { cta }, hold: 2.2 });

/* ═════════════ SCENE GUARD — no demo data, no outside facts on screen ═════════════
 * (a) A data scene whose required props are missing would show its built-in DEMO content (e.g.
 *     scaleCompare's Earth/Jupiter) — that is invented content, so it's swapped for a safe text scene.
 * (b) Every string shown on screen is fact-checked against the source (the director once added a
 *     Burj Khalifa comparison and the other six wonders); failing scenes are swapped too.
 * Required props are read from the registry docs: a prop listed without "?" is required. */
const SAFE = ["factCard", "highlight", "flip3d", "maskReveal", "quote", "typewriter", "decode", "auroraType"];
const NOT_SHOWN = new Set(["prompt", "prompt2", "search", "search2", "src", "src2", "lat", "lon", "backdrop", "energy"]);
const requiredOf = (id) => {
  // Top-level props only: drop nested {...} shapes and (...) notes first.
  const doc = (byId.get(id)?.props || "").replace(/\{[^}]*\}/g, "{}").replace(/\([^)]*\)/g, "");
  if (/^none/i.test(doc)) return [];
  const req = [...doc.matchAll(/(?:^|,\s*)([a-zA-Z0-9]+)(\??):/g)].filter((m) => !m[2]).map((m) => m[1]);
  // globe's optional pins default to demo cities — for a factual reel they must be real.
  if (id === "globe") req.push("pins");
  return req;
};
const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const swaps = [];
const swapSafe = (b, reason) => {
  const usedNow = new Set(beats.map((x) => x.primitive));
  const pick = SAFE.find((s) => !usedNow.has(s)) || "flip3d";
  swaps.push({ from: b.primitive, to: pick, reason, text: b.text });
  delete b.bg; // its footage search was written for the rejected content (e.g. a Colosseum comparison)
  b.primitive = pick;
  b.props = pick === "factCard" ? { fact: b.text } : undefined;
  if (!b.props) delete b.props;
};
for (const b of beats) {
  if (b.primitive === "outro" || b.primitive === "dayStamp") continue;
  const missing = requiredOf(b.primitive).filter((k) => isEmpty(b.props?.[k]));
  if (missing.length) swapSafe(b, `missing ${missing.join(", ")} (would show demo data)`);
}
const flatten = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!NOT_SHOWN.has(k)) flatten(x, out);
  return out;
};
const shown = beats
  .map((b, i) => ({ i, primitive: b.primitive, text: flatten(Object.fromEntries(Object.entries(b.props || {}).filter(([k]) => !NOT_SHOWN.has(k)))).join(" | ").slice(0, 320) }))
  .filter((x) => x.text && x.primitive !== "outro");
if (shown.length) {
  console.log("⑤ ON-SCREEN CHECK…");
  const screenCheck = await groqJSON(
    `You are a strict FACT-CHECKER for text shown ON SCREEN in a factual short video. For each numbered ITEM decide if it states any fact NOT supported by the SOURCE: an extra name, place, number, entity, comparison or claim the source does not contain (even if true in the real world). Generic UI words, labels, questions, simple restatements and arithmetic directly derived from source numbers are fine.
Return ONLY JSON: {"bad":[{"i":item number,"why":"max 8 words"}]} (empty list if all items are fine).`,
    `SOURCE:\n"""${paragraph.slice(0, 6000)}"""\n\nITEMS:\n${shown.map((x, k) => `${k + 1}. [${x.primitive}] ${x.text}`).join("\n")}`,
    { maxTokens: 1200, temperature: 0.1 },
  );
  for (const bad of screenCheck?.bad || []) {
    const item = shown[Number(bad?.i) - 1];
    if (item && beats[item.i] && beats[item.i].primitive === item.primitive) swapSafe(beats[item.i], `on-screen: ${clean(bad.why) || "unsupported"}`);
  }
}

// Percentage scenes (ring, meter) must show a percentage that is actually in the source — otherwise the
// director tends to pour any number into them ("100%" labelled "3800 years").
const srcNumsForPct = new Set((paragraph.match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, "").replace(/,/g, "")));
for (const b of beats) {
  if (!["ring", "meter"].includes(b.primitive)) continue;
  const v = String(b.props?.value ?? "");
  if (!srcNumsForPct.has(v) || !/%|percent/i.test(paragraph)) swapSafe(b, `${b.primitive} value ${v || "?"}% not a percentage from the source`);
}

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
// Data scenes must not SHOW a number the source doesn't contain (a scaleCompare once showed an invented
// "1,000×"). Allowed: source numbers, simple unit scalings of them (2.3 million -> 2300000), tiny counts.
const DATA_SCENES = new Set(["counter", "scaleCompare", "bars", "statGrid", "lineChart", "pie", "funnel", "scoreboard", "price", "timer", "calendar", "ring", "meter", "history", "receipt", "tierList", "quadrant"]);
const ORDINAL_KEYS = new Set(["n", "pick", "highlight", "done", "day", "reveal", "from"]);
const srcVals = [...sourceNums].map(Number).filter(Number.isFinite);
const derivable = (n) => { const v = Number(n); return srcVals.some((s) => [1, 1e3, 1e6, 1e9, 1e-3, 1e-6].some((k) => Math.abs(s * k - v) < 1e-6 * Math.max(1, Math.abs(v)))); };
for (const b of beats) {
  if (!DATA_SCENES.has(b.primitive)) continue;
  const shownNums = Object.fromEntries(Object.entries(b.props || {}).filter(([k]) => !ORDINAL_KEYS.has(k) && !NOT_SHOWN.has(k)));
  const bad = nums(JSON.stringify(shownNums)).filter((n) => !sourceNums.has(n) && !/^0?[0-9]$/.test(n) && !derivable(n));
  if (bad.length) swapSafe(b, `${b.primitive} shows numbers not in the source: ${[...new Set(bad)].join(", ")}`);
}
for (const b of beats) {
  const { prompt, prompt2, search, search2, lat, lon, ...shown } = b.props || {};
  if (lat !== undefined || lon !== undefined) places.push(`${shown.place || "?"} (${lat}, ${lon})`);
  for (const n of nums(JSON.stringify({ t: b.text, p: shown }))) if (!sourceNums.has(n) && !/^0?[0-9]$/.test(n)) flagged.add(n);
}

/* ═════════════ MUSIC — pick a bed from the tracked library by style + mood ═════════════ */
let music = null;
try {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "public/music/catalog.json"), "utf8"));
  const wantCat = ["explainer", "story"].includes(style) ? "documentary" : "tech";
  const mood = clean(written.mood || "").toLowerCase();
  const MOOD_MAP = { mystery: ["mystery", "suspense"], ancient: ["ancient", "solemn", "history"], reflective: ["reflective", "emotional", "calm"], science: ["science", "future"], tension: ["tension", "investigation", "dark", "suspense"], awe: ["awe", "wonder", "space"], epic: ["epic", "triumph", "driving"], future: ["future", "driving"], modern: ["modern", "dark"], "sci-fi": ["sci-fi", "eerie"], calm: ["calm", "minimal", "light"], uplifting: ["uplifting", "bright", "light"] };
  const tags = MOOD_MAP[mood] || [];
  const avgEnergy = beats.reduce((a, b) => a + (b.energy || 2), 0) / beats.length;
  const scored = cat.tracks.map((t) => ({ t, score: (t.category === wantCat ? 3 : 0) + t.moods.filter((m) => tags.includes(m)).length * 2 - Math.abs(t.energy - avgEnergy) + ((Number(process.env.SEED) || paragraph.length) % 7) * 0.01 * (t.id.length % 5) }));
  music = scored.sort((a, b) => b.score - a.score)[0]?.t || null;
} catch (e) {
  console.warn("music catalog unavailable:", e.message);
}

/* ═════════════ HOOKS + CAPTION CHECK ═════════════
 * The alternative hooks and the post caption are published text too ("Alarms blaring 10 seconds
 * before touching down" invented the "10"). Unsupported alt hooks are dropped; an unsupported caption
 * is rewritten from source facts only. */
const altIdx = hooks.map((_, i) => i).filter((i) => i !== chosen);
const textItems = [...altIdx.map((i) => ({ kind: "hook", i, text: clean(hooks[i].text) })), { kind: "caption", text: String(written.caption || "").trim() }].filter((x) => x.text);
const textFixes = [];
if (textItems.length) {
  console.log("⑥ HOOK + CAPTION CHECK…");
  const hc = await groqJSON(
    `You are a strict FACT-CHECKER. For each numbered ITEM, flag any fact (number, date, name, place, claim, superlative) NOT supported by the SOURCE — even if true in the real world. Questions, hashtags, calls to action and style are fine.
Return ONLY JSON: {"bad":[{"i":item number,"why":"max 8 words","fix":"for a CAPTION only: the caption rewritten with ONLY source facts, same language and style, keep the question and hashtags"}]}`,
    `SOURCE:\n"""${paragraph.slice(0, 6000)}"""\n\nITEMS:\n${textItems.map((x, k) => `${k + 1}. [${x.kind}] ${x.text}`).join("\n")}`,
    { maxTokens: 1200, temperature: 0.1 },
  );
  const dropHooks = new Set();
  for (const b of hc?.bad || []) {
    const it = textItems[Number(b?.i) - 1];
    if (!it) continue;
    if (it.kind === "hook") { dropHooks.add(it.i); textFixes.push(`dropped hook "${it.text}" (${clean(b.why)})`); }
    if (it.kind === "caption") {
      const fix = String(b.fix || "").trim();
      textFixes.push(`caption ${fix ? "rewritten" : "flagged"} (${clean(b.why)})`);
      if (fix) written.caption = fix;
    }
  }
  if (dropHooks.size) {
    const keep = hooks.filter((_, i) => !dropHooks.has(i));
    const chosenHook = hooks[chosen];
    hooks.splice(0, hooks.length, ...keep);
    chosen = Math.max(0, hooks.indexOf(chosenHook));
  }
}

/* ═════════════ WRITE + REPORT ═════════════ */
const quality = scoreEdit(beats, menu);
// The spoken first line is the fact-checked hook — the title/chosen hook must use IT, never the
// writer's raw hook (which once said "20,000 slaves" while the source said workers).
if (!verbatim && hooks[chosen]) hooks[chosen].text = lines[0].text;
const hookText = clean(verbatim ? (hooks[chosen]?.text || lines[0].text) : lines[0].text);
const slug = hookText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "draft";
const date = new Date().toISOString().slice(0, 10);
const job = {
  id: `${date}-${slug}`,
  title: hookText,
  subject: clean(written.subject || "").slice(0, 60),
  theme,
  seed: Number(process.env.SEED) || Math.floor(Math.random() * 9000) + 100,
  handle,
  language,
  ...(logo ? { logo } : {}),
  hooks: hooks.map((h) => clean(h.text)),
  caption: [String(written.caption || "").trim(), music ? `
🎵 Music: ${music.attribution}` : ""].join("").trim(),
  ...(music ? { music: music.file, musicCredit: music.attribution } : {}),
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
  factFixes.length
    ? `🔍 **Fact-check:** ${factFixes.filter((f) => f.after).length} line(s) rewritten to stay within your paragraph${factFixes.some((f) => !f.after) ? `, ${factFixes.filter((f) => !f.after).length} flagged` : ""}:
${factFixes.map((f) => `  - ~~${f.before}~~ → ${f.after || "**check this line**"} _(unsupported: ${f.claim || "?"})_`).join("\n")}`
    : "🔍 **Fact-check:** every line is supported by your paragraph.",
  "",
  flagged.size ? `⚠️ **Numbers not found in your paragraph — check before posting:** ${[...flagged].join(", ")}` : "✅ Every number on screen comes from your paragraph.",
  ...(places.length ? ["", `📍 **Map locations to double-check:** ${places.join("; ")}`] : []),
  ...(briefReport.filter((r) => r !== "none").length ? ["", `📝 **Your directions applied:** ${briefReport.filter((r) => r !== "none").join(" · ")}`] : []),
  ...(urduReport.length ? ["", `🇵🇰 **Urdu:** ${urduReport.join(" · ")}`] : []),
  ...(textFixes.length ? ["", `🔍 **Hooks/caption check:** ${textFixes.join(" · ")}`] : []),
  ...(swaps.length ? ["", `🛡️ **Scene guard:** ${swaps.length} scene(s) swapped for safe text scenes:`, ...swaps.map((w) => `  - \`${w.from}\` → \`${w.to}\` _(${w.reason})_`)] : []),
  ...(removed.length ? ["", `🧹 **Removed invented attribution (not in your paragraph):** ${removed.join("; ")}`] : []),
  "",
  ...(music ? [`🎵 **Music:** ${music.title} (${music.category}, ${music.moods.join("/")}) — mood "${clean(written.mood || "auto")}". Credit is already in the caption.`, ""] : []),
  "**Caption:**",
  "```",
  job.caption,
  "```",
];
console.log(report.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `draft=${rel}\n`);
