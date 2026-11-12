// Build the render props from a beat-sheet job file + optional overrides (theme / seed / shaders).
//   node scripts/props.mjs <job.json> [out/props.json]
// Env: THEME, SEED, SHADERS ("auto" | "off")
import fs from "node:fs";
import path from "node:path";

const jobPath = process.argv[2] || "src/data/job.json";
const outPath = process.argv[3] || "out/props.json";
const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));

if (process.env.THEME && process.env.THEME !== "job") job.theme = process.env.THEME;
if (process.env.SEED && /^\d+$/.test(process.env.SEED)) job.seed = Number(process.env.SEED);
if (!Array.isArray(job.beats) || job.beats.length === 0) throw new Error(`${jobPath}: no beats`);

const shaders = (process.env.SHADERS || "auto") !== "off";
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ job, shaders }, null, 2));
console.log(`props → ${outPath} · ${job.beats.length} beats · theme=${job.theme} · seed=${job.seed} · shaders=${shaders}`);
console.log("primitives:", job.beats.map((b) => b.primitive).join(" → "));
