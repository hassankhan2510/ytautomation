/**
 * LINKEDIN RENDER (Phase 4): render the LiCarousel composition (src/data/li_carousel.json) to slides,
 * then assemble the swipeable PDF for the document post.
 *
 * Writes  out/li_slide_01..N.jpg   +   out/li_carousel.pdf
 *   node scripts/li_render.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { imagesToPdf } from "./lib_pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "out");
const CAROUSEL = path.join(ROOT, "src", "data", "li_carousel.json");
const SCRATCH = process.platform === "win32" ? "D:/remotion-temp" : path.join(os.tmpdir(), "remotion-temp");
const ENV = { ...process.env, TMP: SCRATCH, TEMP: SCRATCH, TMPDIR: SCRATCH };

function main() {
  if (!fs.existsSync(CAROUSEL)) { console.error("src/data/li_carousel.json not found — run li_content.mjs first."); process.exit(1); }
  const n = (JSON.parse(fs.readFileSync(CAROUSEL, "utf-8")).slides || []).length;
  if (!n) { console.error("carousel has no slides."); process.exit(1); }

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  const framesDir = path.join(OUT, "_li_frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  console.log(`Rendering ${n} LinkedIn slides...`);
  execSync(`npx remotion render LiCarousel "${framesDir}" --sequence --image-format=jpeg --frames=0-${n - 1} --concurrency=4`, { cwd: ROOT, env: ENV, stdio: "inherit" });

  const files = fs.readdirSync(framesDir)
    .filter((f) => /\.jpe?g$/i.test(f))
    .map((f) => ({ f, k: parseInt((f.match(/(\d+)/) || [])[1] ?? "0", 10) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => path.join(framesDir, x.f));
  if (!files.length) { console.error("no frames rendered."); process.exit(1); }

  files.forEach((f, i) => fs.copyFileSync(f, path.join(OUT, `li_slide_${String(i + 1).padStart(2, "0")}.jpg`)));
  imagesToPdf(files, path.join(OUT, "li_carousel.pdf"));
  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`  + out/li_slide_01..${String(files.length).padStart(2, "0")}.jpg`);
  console.log(`  + out/li_carousel.pdf  (${files.length} pages)`);
}
main();
