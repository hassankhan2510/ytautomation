/**
 * THE GATE. Runs BEFORE anything is generated or rendered.
 *
 * Enforces two things the pipeline depends on:
 *   1. RELIABILITY  — the script.json is complete and well-formed, so nothing
 *                     breaks later at render time.
 *   2. NO LAZINESS  — the AI actually did the work: enough lines for the
 *                     requested duration, real research with sources, varied
 *                     visuals and layouts, no placeholder junk.
 *
 * If any gate FAILS, this exits non-zero and the whole pipeline stops. The AI
 * must fix the script and re-run. "Done" is defined here, by machine, not by vibes.
 *
 * Run:  node scripts/validate.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// Defaults to the project's script.json; accepts an explicit path for testing.
const SCRIPT_JSON = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, "src", "data", "script.json");

// Per-platform expectations. Also documented in docs/PLATFORMS.md.
const PLATFORMS = {
  "youtube-long": { secPerLine: 7, aspect: "16:9" },
  linkedin: { secPerLine: 6, aspect: "1:1 or 9:16" },
  shorts: { secPerLine: 4.5, aspect: "9:16" },
  reel: { secPerLine: 4.5, aspect: "9:16" },
};

const PLACEHOLDER = /\b(todo|tbd|lorem ipsum|placeholder|xxx|insert .* here|example text|your text)\b/i;
const TTS_UNSAFE = /[$%&#]|\b\d{5,}\b/; // symbols / 5+ digit runs (4-digit years read fine)

const results = []; // { gate, ok, msg }
const warnings = [];
function gate(name, ok, msg) {
  results.push({ name, ok, msg });
}
function warn(msg) {
  warnings.push(msg);
}
function words(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function main() {
  if (!fs.existsSync(SCRIPT_JSON)) {
    console.error(`FATAL: ${path.relative(ROOT, SCRIPT_JSON)} not found. The AI must create it first.`);
    process.exit(2);
  }

  let script;
  try {
    script = JSON.parse(fs.readFileSync(SCRIPT_JSON, "utf-8"));
  } catch (e) {
    console.error(`FATAL: script.json is not valid JSON — ${e.message}`);
    process.exit(2);
  }

  const meta = script.meta || {};
  const lines = Array.isArray(script.lines) ? script.lines : [];

  // ---- 1. META COMPLETENESS ----------------------------------------------
  const requiredMeta = [
    "title", "topic", "niche", "channel", "platform",
    "targetSeconds", "style", "voice", "accentColor", "description", "tags", "researchFile",
  ];
  const missing = requiredMeta.filter((k) => meta[k] === undefined || meta[k] === "");
  gate("meta complete", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all meta fields present");

  const platform = meta.platform;
  const pspec = PLATFORMS[platform];
  gate("platform valid", !!pspec, pspec ? `${platform} (${pspec.aspect})` : `unknown platform "${platform}"`);

  if (!/^#[0-9a-fA-F]{6}$/.test(meta.accentColor || "")) {
    gate("accentColor valid", false, `must be #rrggbb, got "${meta.accentColor}"`);
  } else {
    gate("accentColor valid", true, meta.accentColor);
  }

  gate("tags >= 3", Array.isArray(meta.tags) && meta.tags.length >= 3, `${(meta.tags || []).length} tags`);

  // ---- 2. LINES WELL-FORMED ----------------------------------------------
  gate("lines present", lines.length > 0, `${lines.length} lines`);
  const badLines = [];
  lines.forEach((l, i) => {
    if (!l || typeof l.text !== "string" || !l.text.trim()) badLines.push(`#${i} empty text`);
    else if (!Array.isArray(l.keywords) || l.keywords.length < 1) badLines.push(`#${i} no keywords`);
    else if (l.type && !["image", "video"].includes(l.type)) badLines.push(`#${i} bad type "${l.type}"`);
    else if (l.layout && !["lower-third", "center", "title"].includes(l.layout)) badLines.push(`#${i} bad layout "${l.layout}"`);
  });
  gate("every line complete", badLines.length === 0, badLines.length ? badLines.slice(0, 5).join("; ") : "all lines have text + keywords + valid type/layout");

  // ---- 3. NO LAZINESS: enough lines for the requested duration -----------
  if (pspec && meta.targetSeconds) {
    const expected = Math.round(meta.targetSeconds / pspec.secPerLine);
    const minLines = Math.ceil(expected * 0.85);
    gate(
      "duration effort",
      lines.length >= minLines,
      lines.length >= minLines
        ? `${lines.length} lines ≈ ${meta.targetSeconds}s target (min ${minLines})`
        : `TOO SHORT: ${lines.length} lines for a ${meta.targetSeconds}s video — need ≥ ${minLines}. Add more lines.`,
    );
  }

  // ---- 4. NO LAZINESS: no placeholders, no duplicates --------------------
  const placeholders = lines.filter((l) => l.text && PLACEHOLDER.test(l.text)).map((l, i) => i);
  gate("no placeholders", placeholders.length === 0, placeholders.length ? `placeholder text found in ${placeholders.length} line(s)` : "no TODO/placeholder junk");

  const seen = new Set();
  const dupes = [];
  lines.forEach((l) => {
    const key = (l.text || "").trim().toLowerCase();
    if (seen.has(key) && key) dupes.push(key.slice(0, 40));
    seen.add(key);
  });
  gate("no duplicate lines", dupes.length === 0, dupes.length ? `${dupes.length} duplicated line(s)` : "all lines unique");

  // ---- 5. NO LAZINESS: visual + layout variety ---------------------------
  const visuals = new Set(lines.map((l) => l.asset || (l.keywords && l.keywords[0]) || "?"));
  const minVisuals = Math.max(2, Math.ceil(lines.length / 5));
  gate("visual variety", visuals.size >= minVisuals, `${visuals.size} unique visuals (min ${minVisuals})`);

  if (lines.length >= 6) {
    const hasEmphasis = lines.some((l) => l.layout === "center" || l.layout === "title");
    const hasKicker = lines.some((l) => l.kicker);
    gate("layout variety", hasEmphasis && hasKicker,
      hasEmphasis && hasKicker ? "has center/title + kicker" : `needs ≥1 center-or-title (${hasEmphasis}) AND ≥1 kicker (${hasKicker})`);
  }

  // ---- 6. HOOK: first line must grab, not ramble -------------------------
  if (lines[0]) {
    const w = words(lines[0].text);
    gate("hook line", w >= 3 && w <= 32, `first line is ${w} words (want 3–32)`);
  }

  // ---- 7. RESEARCH: real sources, not hallucination ----------------------
  const needResearch = meta.requireResearch !== false;
  if (needResearch) {
    const rf = path.resolve(path.dirname(SCRIPT_JSON), meta.researchFile || "");
    if (!meta.researchFile || !fs.existsSync(rf)) {
      gate("research present", false, `research file "${meta.researchFile}" not found — do the research first`);
    } else {
      const txt = fs.readFileSync(rf, "utf-8");
      const urls = new Set((txt.match(/https?:\/\/[^\s)]+/g) || []));
      gate("research has sources", urls.size >= 3, `${urls.size} source URL(s) (min 3)`);
    }
  }

  // ---- WARNINGS (don't fail, but flag) -----------------------------------
  lines.forEach((l, i) => {
    if (l.text && TTS_UNSAFE.test(l.text)) warn(`line #${i}: contains $/%/&/# or long digits — spell it out for TTS ("${l.text.slice(0, 45)}...")`);
  });

  // ---- REPORT ------------------------------------------------------------
  console.log(`\nValidating: ${meta.title || "(untitled)"}  [${meta.niche}/${meta.channel} -> ${platform}]`);
  console.log("-".repeat(70));
  let failed = 0;
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    if (!r.ok) failed++;
    console.log(`  [${tag}] ${r.name.padEnd(20)} ${r.msg}`);
  }
  if (warnings.length) {
    console.log("\n  Warnings:");
    warnings.slice(0, 10).forEach((w) => console.log(`   - ${w}`));
  }
  console.log("-".repeat(70));

  if (failed > 0) {
    console.log(`\n[X] ${failed} gate(s) FAILED. Fix script.json and run again. Pipeline stopped.\n`);
    process.exit(2);
  }
  console.log(`\n[OK] All gates passed. Script is complete and honest. Proceeding.\n`);
}

main();
