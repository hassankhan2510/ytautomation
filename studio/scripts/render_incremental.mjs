/**
 * STUDIO — INCREMENTAL RENDER: re-render only the scenes that changed.
 *
 * The reel is one TransitionSeries; scene i owns frames [from_i, from_{i+1}) and those frames depend only
 * on: scene i, scene i-1 (the transition INTO i plays at its start, and i-1's last caption chunk can linger),
 * the transition plan (seeded RNG consumed per beat -> every beat's energy/transition/backdrop), the global
 * layers' inputs (captions = word timings in range, progress bar = absolute frame + total length, grain /
 * light leak = absolute frame), the theme/seed and the renderer's own code. All of that is hashed into a
 * FINGERPRINT per scene; a scene whose fingerprint is in the cache is reused, the rest are rendered with one
 * shared bundle + browser, then the pieces are joined WITHOUT re-encoding and the audio track (rendered once,
 * cached by its own fingerprint) is muxed on.
 *
 * Self-check fixes (caption band, a background swap) and visual edits re-render 1-3 scenes, not the reel.
 *
 *   node scripts/render_incremental.mjs out/props.json out/reel.mp4 [cacheDir=out/segcache]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const [propsPath, outPath, cacheDir = "out/segcache"] = process.argv.slice(2);
const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const job = props.job;
const FPS = job.fps || 30;
fs.mkdirSync(cacheDir, { recursive: true });
const t0 = Date.now();

/* ── beat boundaries: a port of buildTimeline() in src/engine/timeline.ts ── */
const tokenize = (t) => String(t || "").split(/\s+/).map((w) => w.trim()).filter(Boolean);
function beatRanges() {
  const beats = job.beats, tokens = beats.map((b) => tokenize(b.text));
  const spoken = job.words && job.words.length ? job.words : null;
  const out = [];
  if (spoken) {
    let wi = 0;
    const starts = [], slices = [];
    for (const toks of tokens) {
      const slice = spoken.slice(wi, wi + toks.length);
      wi += toks.length;
      slices.push(slice);
      const prev = slices.length > 1 ? slices[slices.length - 2] : [];
      const prevEnd = prev.length ? prev[prev.length - 1].end + 0.3 : starts.length ? starts[starts.length - 1] + 1 : 0;
      starts.push(slice.length ? slice[0].start : prevEnd);
    }
    const lastEnd = spoken[spoken.length - 1]?.end ?? 0;
    beats.forEach((b, i) => {
      const from = i === 0 ? 0 : Math.round(starts[i] * FPS);
      const nextFrom = i < beats.length - 1 ? Math.round(starts[i + 1] * FPS) : Math.round((lastEnd + 0.5 + (b.hold || 0)) * FPS);
      out.push({ from, frames: Math.max(Math.round(0.6 * FPS), nextFrom - from), words: slices[i] });
    });
  } else {
    let cursor = 0;
    beats.forEach((b, i) => {
      const e = b.energy || 2, wps = e === 3 ? 3.2 : e === 1 ? 2.4 : 2.8;
      const frames = Math.round((Math.max(0.9, tokens[i].length / wps) + 0.22 + (b.hold || 0)) * FPS);
      out.push({ from: cursor, frames, words: [] });
      cursor += frames;
    });
  }
  return out;
}
const beatR = beatRanges();
const total = beatR.length ? beatR[beatR.length - 1].from + beatR[beatR.length - 1].frames : FPS;
// pieces are strictly back-to-back: piece i = [from_i, next beat's from) — a beat squeezed to zero length is
// folded into its neighbours' fingerprints (each piece hashes beats i-1, i, i+1)
const ranges = beatR.map((r, i) => ({ ...r, i, end: i < beatR.length - 1 ? beatR[i + 1].from : total })).filter((r) => r.end > r.from);

/* ── fingerprints ── */
const sha = (x) => crypto.createHash("sha1").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex").slice(0, 16);
function codeHash() {
  const h = crypto.createHash("sha1");
  const walk = (d) => {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|css|json)$/.test(f)) h.update(p).update(fs.readFileSync(p));
    }
  };
  walk("src");
  return h.digest("hex").slice(0, 16);
}
const fileStamp = (rel) => {
  if (!rel || typeof rel !== "string") return null;
  const p = path.join("public", rel);
  return fs.existsSync(p) ? `${rel}:${fs.statSync(p).size}` : rel;
};
const mediaOf = (b) => b ? [b.bgSrc, b.props?.src, b.props?.src2, b.layers?.far, b.layers?.mid, b.layers?.near].map(fileStamp) : null;
const CODE = codeHash();
const PLAN = sha(job.beats.map((b) => [b.energy || 2, b.transition || null, b.props?.backdrop || null]));
const GLOBAL = sha([job.theme, job.seed, FPS, job.handle, job.logo, props.shaders || false, total, CODE, PLAN]);
const keys = ranges.map((r) => {
  const i = r.i, lo = (beatR[i - 1] || r).from, hi = r.end;
  const words = (job.words || []).filter((w) => w.end * FPS >= lo && w.start * FPS < hi);
  const nb = [i - 1, i, i + 1].map((j) => job.beats[j] || null);
  return sha([GLOBAL, r.from, r.end, nb, nb.map(mediaOf), words]);
});
const audioKey = sha([GLOBAL, job.audio && fileStamp(job.audio), job.music && fileStamp(job.music), job.musicFit, job.sfx, job.words, job.beats.map((b) => [b.energy, b.transition])]);

/* ── render what's missing ── */
const todo = keys.map((k, i) => ({ k, i })).filter(({ k }) => !fs.existsSync(path.join(cacheDir, `${k}.mp4`)));
const needAudio = !fs.existsSync(path.join(cacheDir, `audio-${audioKey}.wav`));
console.log(`🧩 ${ranges.length} scenes · ${ranges.length - todo.length} reused from cache · ${todo.length} to render${needAudio ? " · audio" : " · audio reused"}`);
if (todo.length || needAudio) {
  const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
  const chromiumOptions = { gl: "swangle" };
  const browser = await openBrowser("chrome", { chromiumOptions });
  const composition = await selectComposition({ serveUrl, id: "Reel", inputProps: props, puppeteerInstance: browser, chromiumOptions });
  if (composition.durationInFrames !== total) console.log(`  ! timeline mirror says ${total} frames, composition says ${composition.durationInFrames} — using the composition`);
  const common = { composition, serveUrl, inputProps: props, puppeteerInstance: browser, chromiumOptions, imageFormat: "jpeg", jpegQuality: 92, concurrency: 2, logLevel: "error" };
  for (const { k, i } of todo) {
    const r = ranges[i];
    const end = Math.min(composition.durationInFrames, i === ranges.length - 1 ? composition.durationInFrames : r.end) - 1;
    const ts = Date.now();
    await renderMedia({ ...common, codec: "h264", muted: true, frameRange: [r.from, end], outputLocation: path.join(cacheDir, `${k}.mp4`) });
    console.log(`  scene ${r.i + 1}: frames ${r.from}-${end} rendered in ${((Date.now() - ts) / 1000).toFixed(1)}s`);
  }
  if (needAudio) {
    await renderMedia({ ...common, codec: "wav", outputLocation: path.join(cacheDir, `audio-${audioKey}.wav`) });
    console.log("  audio track rendered");
  }
  await browser.close({ silent: true });
}

/* ── join (no re-encode) + mux audio ── */
const list = path.join(cacheDir, "concat.txt");
fs.writeFileSync(list, keys.map((k) => `file '${path.resolve(cacheDir, `${k}.mp4`).replace(/\\/g, "/")}'`).join("\n"));
const video = path.join(cacheDir, "video.mp4");
execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video]);
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", video, "-i", path.join(cacheDir, `audio-${audioKey}.wav`), "-map", "0:v", "-map", "1:a",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", outPath]);
const msg = `🧩 **Incremental render:** ${ranges.length} scenes, ${ranges.length - todo.length} reused, ${todo.length} rendered · ${((Date.now() - t0) / 1000).toFixed(0)}s`;
console.log(msg);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + "\n");
