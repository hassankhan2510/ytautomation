/**
 * Compress every asset in public/assets that hasn't been compressed yet.
 * Safe to run repeatedly — the manifest skips already-processed files.
 *
 * Run:  node scripts/compress_assets.mjs   (or: npm run compress)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compressAsset, loadManifest, saveManifest } from "./lib_compress.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "public", "assets");
const SCRIPT_JSON = path.join(ROOT, "src", "data", "script.json");

function orientationFromScript() {
  try {
    const s = JSON.parse(fs.readFileSync(SCRIPT_JSON, "utf-8"));
    const p = (s.meta?.platform || "youtube").toLowerCase();
    return ["shorts", "reel", "reels", "tiktok", "instagram"].includes(p) ? "portrait" : "landscape";
  } catch {
    return "landscape";
  }
}

function main() {
  if (!fs.existsSync(ASSET_DIR)) {
    console.log("No public/assets directory yet — nothing to compress.");
    return;
  }
  const orientation = orientationFromScript();
  const manifest = loadManifest(ASSET_DIR);
  const files = fs
    .readdirSync(ASSET_DIR)
    .filter((f) => !f.startsWith("."))
    .map((f) => path.join(ASSET_DIR, f));

  let totalBefore = 0;
  let totalAfter = 0;
  let done = 0;

  console.log(`Compressing assets (${orientation}) ...`);
  for (const file of files) {
    const name = path.basename(file);
    try {
      const res = compressAsset(file, orientation, manifest);
      if (res.skipped) {
        console.log(`  = ${name}  (${res.skipped})`);
      } else {
        totalBefore += res.before;
        totalAfter += res.after;
        done++;
        const pct = Math.round((1 - res.after / res.before) * 100);
        console.log(
          `  + ${name}  ${(res.before / 1e6).toFixed(1)}MB -> ${(res.after / 1e6).toFixed(1)}MB  (-${pct}%)`,
        );
      }
    } catch (e) {
      console.log(`  ! ${name} failed: ${e.message}`);
    }
  }
  saveManifest(manifest);

  if (done > 0) {
    const saved = (totalBefore - totalAfter) / 1e6;
    console.log(
      `\nCompressed ${done} file(s). Saved ${saved.toFixed(1)} MB of disk. Renders will be faster.\n`,
    );
  } else {
    console.log("\nEverything already compressed. Nothing to do.\n");
  }
}

main();
