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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const JOBS = path.join(ROOT, "jobs");
const SCRIPT = path.join(ROOT, "src", "data", "script.json");
const RESEARCH = path.join(ROOT, "src", "data", "research.md");

const SAMPLE = process.argv.includes("--sample");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;

// Windows: route scratch off the full C: drive. Linux (CI): use the default temp.
const ENV = process.platform === "win32"
  ? { ...process.env, TMP: "D:/remotion-temp", TEMP: "D:/remotion-temp", TMPDIR: "D:/remotion-temp" }
  : { ...process.env };
const COMP = { "youtube-long": "YouTube", shorts: "Shorts", reel: "Shorts", linkedin: "Square" };

function run(cmd) {
  execSync(cmd, { cwd: ROOT, env: ENV, stdio: "inherit" });
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

        // Copy-paste publish kit (title/description/hashtags) next to the video.
        try {
          run(`node scripts/publish_kit.mjs src/data/script.json out/${name}.txt`);
        } catch {
          /* kit is best-effort */
        }
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
