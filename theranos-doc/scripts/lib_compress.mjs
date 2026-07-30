/**
 * Shared asset compressor. Uses the ffmpeg that ships with Remotion (no install).
 *
 * - Video: downscale into a 1080p box, re-encode h264, strip audio (backgrounds
 *   are always muted) -> typically 90%+ smaller, much faster to render.
 * - Image: cap to 1920px on the long edge, re-encode as efficient JPEG.
 *
 * A manifest (public/assets/.compressed.json) records what has already been
 * processed so nothing is ever compressed twice (which would degrade quality).
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Route ffmpeg scratch files off the (nearly full) C: drive.
const SCRATCH = "D:/remotion-temp";
const ENV = { ...process.env, TMP: SCRATCH, TEMP: SCRATCH, TMPDIR: SCRATCH };

function ensureScratch() {
  fs.mkdirSync(SCRATCH, { recursive: true });
}

function runFfmpeg(args) {
  // Build a fully-quoted command string. Paths contain spaces on this machine,
  // so every token gets double-quoted; execSync runs it through the shell where
  // `npx` resolves correctly.
  const quoted = args.map((a) => `"${a}"`).join(" ");
  execSync(`npx remotion ffmpeg -y ${quoted}`, { env: ENV, stdio: "ignore" });
}

function loadManifest(assetDir) {
  const p = path.join(assetDir, ".compressed.json");
  try {
    return { path: p, data: JSON.parse(fs.readFileSync(p, "utf-8")) };
  } catch {
    return { path: p, data: {} };
  }
}

function saveManifest(m) {
  fs.writeFileSync(m.path, JSON.stringify(m.data, null, 2));
}

/**
 * Compress one asset in place. Returns { skipped } or { before, after }.
 * orientation: "landscape" (1920x1080 box) or "portrait" (1080x1920 box).
 */
export function compressAsset(filePath, orientation = "landscape", manifest = null) {
  ensureScratch();
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const isVideo = VIDEO_EXT.has(ext);
  const isImage = IMAGE_EXT.has(ext);
  if (!isVideo && !isImage) return { skipped: "unsupported" };

  const ownManifest = manifest || loadManifest(path.dirname(filePath));
  if (ownManifest.data[name]) return { skipped: "already-compressed" };

  const before = fs.statSync(filePath).size;
  const [W, H] = orientation === "portrait" ? [1080, 1920] : [1920, 1080];
  const scale = `scale=w=${W}:h=${H}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const tmpOut = path.join(SCRATCH, `cmp_${Date.now?.() ?? "x"}_${name}`);

  if (isVideo) {
    runFfmpeg([
      "-i", filePath,
      "-vf", scale,
      "-c:v", "libx264",
      "-crf", "26",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-an",
      tmpOut,
    ]);
  } else {
    runFfmpeg(["-i", filePath, "-vf", scale, "-q:v", "4", tmpOut]);
  }

  // Replace original in place, then record it.
  fs.copyFileSync(tmpOut, filePath);
  fs.rmSync(tmpOut, { force: true });
  const after = fs.statSync(filePath).size;

  ownManifest.data[name] = { before, after, at: "compressed" };
  if (!manifest) saveManifest(ownManifest);
  return { before, after };
}

export { loadManifest, saveManifest };
