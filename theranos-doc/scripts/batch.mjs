/**
 * BATCH: render every video in jobs/ one after another.
 *
 * Each jobs/<name>.json is a full script (meta+lines). For each one, batch:
 *   1. swaps it into src/data/script.json (and jobs/<name>.research.md -> research.md)
 *   2. runs validate -> voiceover -> assets -> compress
 *   3. renders the right composition to out/<name>_<platform>.mp4
 * Your current src/data/script.json + research.md are backed up and restored at the end.
 * A job that fails is logged and skipped — the rest still run.
 *
 * Run:  node scripts/batch.mjs [--sample] [--only=<substr>]
 *   --sample     render only the first 45 frames of each (fast wiring check)
 *   --only=reel  only run jobs whose filename contains this substring
 *
 * On GitHub Actions, the batch workflow renders all jobs in PARALLEL instead.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createZip } from "./lib_zip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const JOBS = path.join(ROOT, "jobs");
const SCRIPT = path.join(ROOT, "src", "data", "script.json");
const RESEARCH = path.join(ROOT, "src", "data", "research.md");

const SAMPLE = process.argv.includes("--sample");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;
// Voice engine: --voice=auto|kokoro|edge|myvoice (or the VOICE env). Cross-platform, so on
// Windows PowerShell you don't have to fight inline env vars — just:  npm run batch -- --voice=myvoice
const voiceArg = process.argv.find((a) => a.startsWith("--voice="));
const VOICE = voiceArg ? voiceArg.split("=")[1] : process.env.VOICE || "auto";

// Windows: route scratch off the full C: drive. Linux (CI): use the default temp.
const ENV = process.platform === "win32"
  ? { ...process.env, VOICE, SOFT_GATES: "1", TMP: "D:/remotion-temp", TEMP: "D:/remotion-temp", TMPDIR: "D:/remotion-temp" }
  : { ...process.env, VOICE, SOFT_GATES: "1" };
const COMP = { "youtube-long": "YouTube", shorts: "Shorts", reel: "Shorts", linkedin: "Square" };

function run(cmd) {
  execSync(cmd, { cwd: ROOT, env: ENV, stdio: "inherit" });
}

// Normalize the finished video's audio to -14 LUFS (YouTube's reference level) so every
// video sits at a consistent, professional loudness. Uses the ffmpeg bundled with Remotion
// (its build includes the loudnorm filter). Best-effort: on any failure the original is kept.
function normalizeLoudness(outFile) {
  const abs = path.join(ROOT, outFile);
  if (!fs.existsSync(abs)) return;
  const tmp = abs.replace(/\.mp4$/, ".norm.mp4");
  try {
    execSync(
      `npx remotion ffmpeg -y -i "${abs}" -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:v copy -c:a aac -b:a 192k "${tmp}"`,
      { cwd: ROOT, env: ENV, stdio: "ignore" },
    );
    fs.rmSync(abs, { force: true });
    fs.renameSync(tmp, abs);
    console.log(`  ~ loudness normalized to -14 LUFS: ${outFile}`);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    console.log(`  ! loudness normalize skipped (${String(e.message).split("\n")[0]})`);
  }
}
// Collect every deliverable belonging to <name> and zip them into out/<name>.zip, then remove the
// loose files. Exact-prefix matching so a long job never sweeps up its own shorts' files.
function bundleJob(name, platform) {
  try {
    const outDir = path.join(ROOT, "out");
    if (!fs.existsSync(outDir)) return;
    const slide = new RegExp(`^${name}_slide_\\d+\\.jpg$`);
    const wanted = fs.readdirSync(outDir).filter(
      (f) =>
        f === `${name}_${platform}.mp4` ||
        f === `${name}.txt` ||
        f === `${name}_carousel.pdf` ||
        f === `${name}_thumb.png` ||
        slide.test(f),
    );
    if (!wanted.length) return;
    const entries = wanted.map((f) => ({ name: f, data: fs.readFileSync(path.join(outDir, f)) }));
    createZip(path.join(outDir, `${name}.zip`), entries);
    for (const f of wanted) fs.rmSync(path.join(outDir, f), { force: true });
    console.log(`  = out/${name}.zip  (${wanted.length} files bundled)`);
  } catch (e) {
    console.log(`  ! zip bundle failed (${String(e.message).split("\n")[0]}) — loose files kept.`);
  }
}

// Optional auto-upload to YouTube (only when UPLOAD=1 and the channel's refresh token is present).
// Runs AFTER render (mp4 still loose) and is best-effort — a failed upload never fails the video.
function uploadToYouTube(name, outFile) {
  const channel = name.split("_")[0];
  const tokenVar = `YT_REFRESH_TOKEN_${channel.toUpperCase()}`;
  if (!process.env[tokenVar] || !process.env.YT_CLIENT_ID) {
    console.log(`  (upload skipped — ${tokenVar} not set)`);
    return;
  }
  try {
    run(
      `node scripts/yt_upload.mjs --channel=${channel} --video=${outFile} --script=jobs/${name}.json --privacy=${process.env.YT_PRIVACY || "private"}`,
    );
  } catch (e) {
    console.log(`  ! upload failed (${String(e.message).split("\n")[0]}) — non-fatal`);
  }
}

function backup(p) {
  if (fs.existsSync(p)) fs.copyFileSync(p, p + ".bak");
}
function restore(p) {
  if (fs.existsSync(p + ".bak")) {
    fs.copyFileSync(p + ".bak", p);
    fs.rmSync(p + ".bak", { force: true });
  }
}

function main() {
  if (!fs.existsSync(JOBS)) {
    console.error("No jobs/ folder. Add jobs/<name>.json, or run autocut first.");
    process.exit(1);
  }
  let jobs = fs
    .readdirSync(JOBS)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => (only ? f.includes(only) : true))
    .sort();

  if (jobs.length === 0) {
    console.error("No matching job files in jobs/.");
    process.exit(1);
  }

  console.log(`Batch: ${jobs.length} job(s)${SAMPLE ? " [SAMPLE: 45 frames each]" : ""}\n`);
  backup(SCRIPT);
  backup(RESEARCH);

  const results = [];
  try {
    for (const file of jobs) {
      const name = path.basename(file, ".json");
      const jobPath = path.join(JOBS, file);
      console.log(`\n========== ${name} ==========`);
      try {
        const job = JSON.parse(fs.readFileSync(jobPath, "utf-8"));
        const platform = job.meta?.platform || "youtube-long";
        const comp = COMP[platform] || "YouTube";

        // Swap content in.
        fs.copyFileSync(jobPath, SCRIPT);
        const jobResearch = path.join(JOBS, `${name}.research.md`);
        if (fs.existsSync(jobResearch)) fs.copyFileSync(jobResearch, RESEARCH);

        run("node scripts/validate.mjs");
        run("python scripts/gen_voiceover.py");
        run("node scripts/fetch_assets.mjs");
        run("node scripts/compress_assets.mjs");

        const outFile = `out/${name}_${platform}.mp4`;
        const frames = SAMPLE ? " --frames=0-45" : "";
        run(`npx remotion render ${comp} ${outFile}${frames} --concurrency=4`);
        if (!SAMPLE) normalizeLoudness(outFile);
        if (!SAMPLE && process.env.UPLOAD === "1") uploadToYouTube(name, outFile);

        // Copy-paste publish kit (title/description/hashtags) next to the video.
        try {
          run(`node scripts/publish_kit.mjs src/data/script.json out/${name}.txt`);
        } catch {
          /* kit is best-effort */
        }
        // Repurpose the script into a LinkedIn/Instagram carousel (JPEG slides + PDF).
        if (!SAMPLE) {
          try {
            run(`node scripts/make_carousel.mjs ${name}`);
          } catch {
            /* carousel is best-effort — the video still ships */
          }
        }
        // YouTube thumbnail (long-form only — Shorts don't use a 16:9 thumbnail).
        if (!SAMPLE && platform === "youtube-long") {
          try {
            run(`node scripts/make_thumbnail.mjs --out=out/${name}_thumb.png`);
          } catch {
            /* thumbnail is best-effort — the video still ships */
          }
        }
        // Bundle ALL of this video's deliverables (reel + kit txt + carousel pdf + slides) into one
        // zip, so the output folder is one file per video instead of a scatter of loose files.
        if (!SAMPLE) bundleJob(name, platform);
        results.push(`OK   ${name} -> ${outFile}`);
      } catch (e) {
        results.push(`FAIL ${name} (${String(e.message).split("\n")[0]})`);
        console.error(`  ! ${name} failed — skipping.`);
      }
    }
  } finally {
    restore(SCRIPT);
    restore(RESEARCH);
  }

  console.log("\n================ BATCH SUMMARY ================");
  results.forEach((r) => console.log("  " + r));
  console.log("==============================================\n");

  // Fail loudly if NOTHING rendered — otherwise the workflow shows a misleading green.
  const okCount = results.filter((r) => r.startsWith("OK")).length;
  if (okCount === 0) {
    console.error("No videos were produced — all jobs failed. See the FAIL reasons above.");
    process.exit(1);
  }
}

main();
