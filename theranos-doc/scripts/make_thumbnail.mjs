/**
 * THUMBNAIL: generate a CTR YouTube thumbnail = Pollinations-AI background + our own text layer.
 * Per-channel image style + clickbait text, with 4 rotating layouts so no two look the same.
 *
 * In the pipeline it reads the swapped-in src/data/script.json (title, meta.thumb clickbait text,
 * meta.thumbStyle per-channel image flavour, brand, accent). Standalone/manual overrides:
 *
 *   node scripts/make_thumbnail.mjs --channel=equitier \
 *     --text="INDEX FUNDS*|BEAT THE PROS" --sub="The boring strategy that wins" \
 *     --prompt="cinematic dark financial background" --variant=2 --out=out/thumb.png
 *
 * --text : lines separated by "|"; a trailing/inline "*" colours that line in the brand accent.
 * Pollinations is free & keyless; if unreachable we fall back to a styled gradient. No video renders.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const SCRIPT_JSON = path.join(ROOT, "src", "data", "script.json");
const THUMB_JSON = path.join(ROOT, "src", "data", "thumbnail.json");
const BG_DIR = path.join(ROOT, "public", "thumb");
const SCRATCH = process.platform === "win32" ? "D:/remotion-temp" : path.join(os.tmpdir(), "remotion-temp");
const ENV = { ...process.env, TMP: SCRATCH, TEMP: SCRATCH, TMPDIR: SCRATCH };

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(SCRIPT_JSON, "utf-8")).meta || {};
  } catch {
    return {};
  }
}
function readConfig(channel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO, "channels", "config.json"), "utf-8"))[channel] || {};
  } catch {
    return {};
  }
}

const meta = readMeta();
const CHANNEL = (arg("channel", meta.channel || "equitier")).toLowerCase();
const cfg = readConfig(CHANNEL);
const TITLE = arg("title", meta.title || "");
const TEXT = arg("text", "");
const SUB = arg("sub", "");
const PROMPT = arg("prompt", "");
const VARIANT = arg("variant", "");
const OUT = arg("out", `out/${CHANNEL}_thumb.png`);

const brand = meta.brand || cfg.brand || CHANNEL.toUpperCase();
const accent = meta.accentColor || cfg.accentColor || "#10B981";
const thumbStyle = meta.thumbStyle || cfg.thumbStyle || "cinematic professional background";
const thumb = meta.thumb || null;

const NICHE_VISUAL = {
  finance: "financial charts and money, professional",
  business: "modern office and startup energy",
  deeptech: "futuristic tech, sensors, robotics",
  facts: "vivid science and space, colorful",
};

const STOP = new Set("the a an and or but of to in on for with is are was were be this that how why what your you".split(" "));
function subjectWords() {
  const seed = TEXT ? TEXT.replace(/[*|]/g, " ") : thumb ? `${thumb.line1} ${thumb.line2}` : TITLE;
  return String(seed || cfg.niche || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .slice(0, 5)
    .join(" ");
}
function buildPrompt() {
  if (PROMPT) return PROMPT;
  const style = thumbStyle || NICHE_VISUAL[cfg.niche] || "cinematic professional background";
  return `${subjectWords()}, ${style}, cinematic, dark moody background, dramatic lighting, depth of field, high detail, 4k, NO text, no words, no letters, no logo`;
}

function hashNum(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h;
}

function buildLines() {
  if (TEXT) {
    return TEXT.split("|").map((s) => ({ t: s.replace(/\*/g, "").trim().toUpperCase(), hi: s.includes("*") })).filter((l) => l.t);
  }
  if (thumb && thumb.line1) {
    return [
      { t: String(thumb.line1).toUpperCase(), hi: true },
      ...(thumb.line2 ? [{ t: String(thumb.line2).toUpperCase() }] : []),
    ];
  }
  // Fallback: split the title into two punchy lines.
  const words = String(TITLE || brand).replace(/[:—-].*$/, "").trim().split(/\s+/);
  const mid = Math.ceil(words.length / 2);
  return [
    { t: words.slice(0, mid).join(" ").toUpperCase(), hi: true },
    { t: words.slice(mid).join(" ").toUpperCase() },
  ].filter((l) => l.t);
}

async function fetchBackground(prompt) {
  fs.mkdirSync(BG_DIR, { recursive: true });
  const seed = hashNum(prompt) % 100000;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&model=flux&seed=${seed}`;
  console.log(`Pollinations: ${prompt.slice(0, 80)}...`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) throw new Error("image too small / empty");
    const rel = `thumb/${CHANNEL}_bg.jpg`;
    fs.writeFileSync(path.join(ROOT, "public", rel), buf);
    console.log(`  + public/${rel}  (${(buf.length / 1024).toFixed(0)} KB)`);
    return rel;
  } catch (e) {
    console.log(`  ! Pollinations failed (${e.message}) — using a styled gradient background instead.`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const bg = await fetchBackground(buildPrompt());
  const lines = buildLines();
  const variant = VARIANT !== "" ? Number(VARIANT) % 4 : hashNum(lines.map((l) => l.t).join("|")) % 4;

  fs.writeFileSync(
    THUMB_JSON,
    JSON.stringify({ bg, brand, accent, lines, sub: SUB || thumb?.sub || "", variant }, null, 2),
  );

  fs.mkdirSync(path.join(ROOT, path.dirname(OUT)), { recursive: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  console.log(`Rendering thumbnail (variant ${variant})...`);
  execSync(`npx remotion still Thumbnail "${OUT}"`, { cwd: ROOT, env: ENV, stdio: "inherit" });
  console.log(`\nDone -> ${OUT}`);
}

main().catch((e) => { console.error("thumbnail failed:", e.message); process.exit(1); });
