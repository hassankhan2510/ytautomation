/**
 * Step 2 of the pipeline: ASSETS.
 *
 * Reads  src/data/script.json
 * Ensures every line's `asset` exists in public/assets/.
 *   - If the file already exists  -> keep it (zero-cost, offline).
 *   - If it is missing            -> download a matching clip/photo from Pexels
 *                                    using the line's `keywords`.
 *
 * Free Pexels API key: https://www.pexels.com/api/  ->  set it as an env var:
 *     PowerShell:  $env:PEXELS_API_KEY = "your_key"
 *     bash:        export PEXELS_API_KEY=your_key
 *
 * With NO key set, the script just reports what is missing and exits cleanly,
 * so the rest of the pipeline still runs on whatever assets you already have.
 *
 * Run:  node scripts/fetch_assets.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compressAsset, loadManifest, saveManifest } from "./lib_compress.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCRIPT_JSON = path.join(ROOT, "src", "data", "script.json");
const ASSET_DIR = path.join(ROOT, "public", "assets");

const PEXELS_KEY = process.env.PEXELS_API_KEY || "";
const PEXELS_IMG = "https://api.pexels.com/v1/search";
const PEXELS_VIDEO = "https://api.pexels.com/videos/search";

function log(msg) {
  process.stdout.write(msg + "\n");
}

async function pexelsImage(query, orientation) {
  const url = `${PEXELS_IMG}?query=${encodeURIComponent(query)}&per_page=1&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels image ${res.status}`);
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) return null;
  // "large2x" is ~1880px wide — plenty for 1080p, small enough to grab fast.
  return photo.src?.large2x || photo.src?.original;
}

async function pexelsVideo(query, orientation) {
  const url = `${PEXELS_VIDEO}?query=${encodeURIComponent(query)}&per_page=3&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels video ${res.status}`);
  const data = await res.json();
  const video = data.videos?.[0];
  if (!video) return null;
  // Pick the HD file closest to 1080p high.
  const files = (video.video_files || []).sort((a, b) => (b.width || 0) - (a.width || 0));
  const hd = files.find((f) => (f.height || 0) <= 1200) || files[0];
  return hd?.link || null;
}

async function download(url, dest, timeoutMs) {
  const ctrl = new AbortController();
  const t = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, timeoutMs ? { signal: ctrl.signal } : {});
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return buf.length;
  } finally {
    if (t) clearTimeout(t);
  }
}

// AI images (Pollinations, free + keyless — the same generator the thumbnail step uses). Turned on
// with AI_IMAGES=1 (the Instagram/Facebook workflow sets it). Used for IMAGE scenes; video scenes
// still come from Pexels so the reel keeps some motion.
const AI_STYLE = {
  finance: "financial markets, gold, currency, trading floor, professional",
  business: "modern business, startup, office energy",
  deeptech: "futuristic technology, robotics, sensors, sci-fi",
  facts: "vivid science and space, colorful",
};
function hashNum(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h;
}
function aiPrompt(keywords, style, niche) {
  const subject = (keywords || []).filter(Boolean).slice(0, 2).join(", ") || niche || "cinematic background";
  const flavor = style || AI_STYLE[niche] || "cinematic professional background";
  // Atmospheric only — AI renders text/charts as gibberish, so the engine's chart/stat layouts carry
  // the real numbers while these images set the mood.
  return `${subject}, ${flavor}, cinematic, dramatic lighting, dark moody, depth of field, high detail, no text, no letters, no numbers, no watermark, no logo`;
}
function pollinationsUrl(prompt, orientation, seed) {
  const [w, h] = orientation === "portrait" ? [1080, 1920] : [1280, 720];
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;
}

async function main() {
  const script = JSON.parse(fs.readFileSync(SCRIPT_JSON, "utf-8"));
  const platform = (script.meta?.platform || "youtube").toLowerCase();
  // Vertical platforms want portrait footage.
  const orientation = ["shorts", "reel", "reels", "tiktok", "instagram"].includes(platform)
    ? "portrait"
    : "landscape";

  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const manifest = loadManifest(ASSET_DIR);

  // De-dupe by asset filename so we only fetch each unique asset once.
  const need = new Map(); // assetName -> { type, keywords }
  for (const line of script.lines) {
    if (!line.asset) continue;
    const dest = path.join(ASSET_DIR, line.asset);
    if (fs.existsSync(dest)) continue;
    if (!need.has(line.asset)) {
      need.set(line.asset, { type: line.type || "image", keywords: line.keywords || [] });
    }
  }

  const haveCount = script.lines.filter((l) => l.asset && fs.existsSync(path.join(ASSET_DIR, l.asset)))
    .length;
  log(`Assets present: ${haveCount} lines already covered.`);

  if (need.size === 0) {
    log("All assets present. Nothing to download.\n");
    return;
  }

  log(`Missing ${need.size} unique asset(s): ${[...need.keys()].join(", ")}`);

  const AI = process.env.AI_IMAGES === "1";
  const thumbStyle = script.meta?.thumbStyle || "";
  if (!PEXELS_KEY && !AI) {
    log("\nNo PEXELS_API_KEY set and AI_IMAGES not enabled — skipping auto-download.");
    log("Either add the missing files to public/assets/ manually,");
    log("get a free key at https://www.pexels.com/api/ (PEXELS_API_KEY), or set AI_IMAGES=1.\n");
    return;
  }

  const niche = String(script.meta?.niche || "").trim();
  let changed = false;
  const conversions = new Map(); // oldAssetName -> newImageName|null (applied to script.json AND timeline.json)
  // Repoint every line using `assetName` to an IMAGE. A missing VIDEO hard-fails the render
  // (OffthreadVideo delayRender times out); a missing IMAGE just shows a dark background. So any video
  // scene we can't source as a real clip is converted to an image scene here.
  const toImage = (assetName, newAsset) => {
    for (const l of script.lines) if (l.asset === assetName) { l.type = "image"; if (newAsset) l.asset = newAsset; else delete l.asset; }
    conversions.set(assetName, newAsset || null);
    changed = true;
  };
  const queriesFor = (assetName, kw) =>
    [kw[0], kw[1], path.parse(assetName).name.replace(/_/g, " "), niche || "", "cinematic abstract dark background"].filter(Boolean);
  const compressNote = (bytes, f) => {
    let note = `${(bytes / 1e6).toFixed(2)} MB`;
    try {
      const res = compressAsset(f, orientation, manifest);
      if (res.before && res.after) { const pct = Math.round((1 - res.after / res.before) * 100); note = `${(res.after / 1e6).toFixed(2)} MB${pct > 0 ? `, -${pct}% compressed` : ""}`; }
    } catch (e) { note += ` (compress skipped: ${e.message})`; }
    return note;
  };

  for (const [assetName, info] of need) {
    const isVideo = info.type === "video";
    const dest = path.join(ASSET_DIR, assetName);
    // For a video scene, an AI/Pexels IMAGE lands as a .jpg and the scene is converted to image.
    const imgName = isVideo ? assetName.replace(/\.[^.]+$/, "") + ".jpg" : assetName;
    const imgDest = path.join(ASSET_DIR, imgName);
    let done = false;

    // 1) Video scene: try a real Pexels CLIP first (keeps motion) — only if a key is set.
    if (isVideo && PEXELS_KEY) {
      for (const q of queriesFor(assetName, info.keywords)) {
        try {
          const link = await pexelsVideo(q, orientation);
          if (!link) continue;
          const bytes = await download(link, dest);
          if (bytes < 1500) { fs.rmSync(dest, { force: true }); continue; }
          log(`  + ${assetName}  <- video "${q}"  (${compressNote(bytes, dest)})`);
          done = true; break;
        } catch { /* next query */ }
      }
    }

    // 2) AI image (free Pollinations) — for image scenes, and the fallback for video scenes. A video
    //    scene that gets an AI image is converted to an image scene so the render loads the .jpg.
    if (!done && AI) {
      try {
        const seed = hashNum(assetName) % 100000;
        const url = pollinationsUrl(aiPrompt(info.keywords, thumbStyle, niche), orientation, seed);
        const bytes = await download(url, imgDest, 90000);
        if (bytes > 3000) { if (isVideo) toImage(assetName, imgName); log(`  + ${imgName}  <- AI image (pollinations)  (${compressNote(bytes, imgDest)})`); done = true; }
        else fs.rmSync(imgDest, { force: true });
      } catch (e) { log(`  ! AI image failed for ${assetName} (${String(e.message).slice(0, 60)})`); }
    }

    // 3) Pexels IMAGE fallback (image scenes, or converting a video scene to an image).
    if (!done && PEXELS_KEY) {
      for (const q of queriesFor(assetName, info.keywords)) {
        try {
          const link = await pexelsImage(q, orientation);
          if (!link) continue;
          const bytes = await download(link, imgDest);
          if (bytes < 1500) { fs.rmSync(imgDest, { force: true }); continue; }
          if (isVideo) toImage(assetName, imgName);
          log(`  + ${imgName}  <- image "${q}"  (${compressNote(bytes, imgDest)})`);
          done = true; break;
        } catch { /* next query */ }
      }
    }

    // 4) Last resort: nothing found. For a video scene, convert to image WITHOUT an asset so the render
    //    shows a dark background instead of hanging on a missing video.
    if (!done) {
      if (isVideo) { toImage(assetName, null); log(`  ! no clip for ${assetName} — scene set to a dark background`); }
      else log(`  ! could not fetch ${assetName} — scene will show a dark background`);
    }
  }
  if (changed) {
    fs.writeFileSync(SCRIPT_JSON, JSON.stringify(script, null, 2));
    // timeline.json is generated by gen_voiceover BEFORE this step and is what the render actually
    // reads — patch the same converted lines there, or the render still expects the missing video.
    try {
      const TL = path.join(ROOT, "src", "data", "timeline.json");
      if (fs.existsSync(TL)) {
        const tl = JSON.parse(fs.readFileSync(TL, "utf-8"));
        for (const l of tl.lines || []) if (conversions.has(l.asset)) { const na = conversions.get(l.asset); l.type = "image"; if (na) l.asset = na; else delete l.asset; }
        fs.writeFileSync(TL, JSON.stringify(tl, null, 2));
      }
    } catch (e) { log(`  ! timeline patch skipped (${e.message})`); }
    log("  ~ script.json + timeline.json updated (unsourced video scenes -> images)");
  }
  saveManifest(manifest);
  log("\nAsset fetch complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
