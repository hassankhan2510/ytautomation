/**
 * Writes a copy-paste "publish kit" (title, alternative titles, description, hashtags,
 * tags) from a script's meta — so uploading is copy-paste, not guesswork.
 *
 * Usage:
 *   node scripts/publish_kit.mjs [scriptPath] [outPath]
 * Defaults: scriptPath = src/data/script.json, outPath = out/publish_kit.txt
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const scriptPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "src", "data", "script.json");
const outPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, "out", "publish_kit.txt");

function main() {
  const s = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const m = s.meta || {};
  const tags = m.tags || [];
  const hashtags = (m.hashtags && m.hashtags.length ? m.hashtags : tags)
    .map((t) => "#" + String(t).replace(/[^a-z0-9]/gi, ""))
    .filter((t) => t.length > 1);

  const lines = [];
  lines.push("=== PUBLISH KIT ===");
  lines.push(`Platform: ${m.platform || "-"}    Niche: ${m.niche || "-"}    Language voice: ${m.voice || "-"}`);
  lines.push("");
  lines.push("BEST TITLE:");
  lines.push(`  ${m.title || "(none)"}`);
  lines.push("");
  if (m.titleOptions && m.titleOptions.length) {
    lines.push("ALTERNATIVE TITLES (A/B pick one):");
    m.titleOptions.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
    lines.push("");
  }
  lines.push("DESCRIPTION:");
  lines.push(`  ${m.description || ""}`);
  lines.push("");
  lines.push("HASHTAGS:");
  lines.push(`  ${hashtags.join(" ")}`);
  lines.push("");
  lines.push("TAGS (comma-separated):");
  lines.push(`  ${tags.join(", ")}`);
  lines.push("");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Publish kit written: ${path.relative(ROOT, outPath)}`);
}

main();
