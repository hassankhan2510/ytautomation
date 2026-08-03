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

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
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

  if (!PEXELS_KEY) {
    log("\nNo PEXELS_API_KEY set — skipping auto-download.");
    log("Either add the missing files to public/assets/ manually,");
    log("or get a free key at https://www.pexels.com/api/ and set PEXELS_API_KEY.\n");
    return;
  }

  const niche = String(script.meta?.niche || "").trim();
  for (const [assetName, info] of need) {
    const dest = path.join(ASSET_DIR, assetName);
    // Try the specific keyword first, then progressively more generic fallbacks — so a keyword with
    // NO Pexels match (e.g. a company name like "atlassian") still gets a relevant clip instead of
    // leaving a blank/404 scene.
    const queries = [
      info.keywords[0],
      info.keywords[1],
      path.parse(assetName).name.replace(/_/g, " "),
      niche && `${niche}`,
      "cinematic abstract dark background",
    ].filter(Boolean);

    let done = false;
    for (const query of queries) {
      try {
        const link =
          info.type === "video"
            ? await pexelsVideo(query, orientation)
            : await pexelsImage(query, orientation);
        if (!link) continue; // no result for this query — try the next fallback
        const bytes = await download(link, dest);
        if (bytes < 1500) { fs.rmSync(dest, { force: true }); continue; } // tiny/corrupt — try next
        let note = `${(bytes / 1e6).toFixed(1)} MB`;
        try {
          const res = compressAsset(dest, orientation, manifest);
          if (res.before && res.after) {
            const pct = Math.round((1 - res.after / res.before) * 100);
            note = `${(res.after / 1e6).toFixed(1)} MB, -${pct}% compressed`;
          }
        } catch (e) {
          note += ` (compress skipped: ${e.message})`;
        }
        log(`  + ${assetName}  <- "${query}"  (${note})`);
        done = true;
        break;
      } catch (err) {
        /* try the next fallback query */
      }
    }
    if (!done) log(`  ! could not fetch ${assetName} (tried: ${queries.join(", ")}) — scene will show a dark background`);
  }
  saveManifest(manifest);
  log("\nAsset fetch complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
