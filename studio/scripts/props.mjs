// Build the render props from a beat-sheet job file + optional overrides (theme / seed / shaders).
//   node scripts/props.mjs <job.json> [out/props.json]
// Env: THEME, SEED, SHADERS ("auto" | "off")
//
// Beats with `props.prompt` and no `props.src` get a free AI image (Pollinations) downloaded into
// public/gen/ first. If that fails, the beat keeps no src and the primitive renders a seeded
// generative world instead — a render never waits on, or breaks because of, an image service.
import fs from "node:fs";
import path from "node:path";

const jobPath = process.argv[2] || "src/data/job.json";
const outPath = process.argv[3] || "out/props.json";
const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));

if (process.env.THEME && process.env.THEME !== "job") job.theme = process.env.THEME;
if (process.env.SEED && /^\d+$/.test(process.env.SEED)) job.seed = Number(process.env.SEED);
if (!Array.isArray(job.beats) || job.beats.length === 0) throw new Error(`${jobPath}: no beats`);

const STYLE = "cinematic, moody, deep black and crimson red lighting, high contrast, 35mm film grain, no text, no watermark";

async function fetchImage(prompt, file, seed) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, ${STYLE}`)}?width=1080&height=1920&nologo=true&seed=${seed}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.startsWith("image/")) throw new Error(`HTTP ${res.status} ${type}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000) throw new Error(`too small (${buf.length} bytes)`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return true;
    } catch (e) {
      console.warn(`  image attempt ${attempt} failed: ${e.message}`);
    }
  }
  return false;
}

for (const [i, b] of job.beats.entries()) {
  const p = b.props || {};
  if (!p.prompt || p.src) continue;
  const rel = `gen/${job.id || "job"}-${i}.jpg`;
  console.log(`beat ${i}: AI image for "${p.prompt}"`);
  if (await fetchImage(p.prompt, path.join("public", rel), (job.seed || 1) * 100 + i)) {
    b.props = { ...p, src: rel };
    console.log(`  → public/${rel}`);
  } else {
    console.log("  → no image; the beat will render a generative scene");
  }
}

const shaders = (process.env.SHADERS || "auto") !== "off";
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ job, shaders }, null, 2));
console.log(`props → ${outPath} · ${job.beats.length} beats · theme=${job.theme} · seed=${job.seed} · shaders=${shaders}`);
console.log("primitives:", job.beats.map((b) => b.primitive).join(" → "));
