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
      if (/HTTP 402/.test(e.message)) break; // free tier refused — retrying will not help
    }
  }
  return false;
}

/**
 * REAL archival photos from Wikimedia Commons (free licences: public domain / CC0 / CC BY / CC BY-SA).
 * Best source for history & research — real images beat AI fakes for accuracy. Credits are recorded
 * in job.credits so CC BY / BY-SA attribution can go in the post caption.
 */
const UA = "StudioReelRenderer/1.0 (automated render job; GitHub Actions)";
const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
async function fetchCommons(query, file) {
  try {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280`;
    const res = await fetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`search HTTP ${res.status}`);
    const pages = Object.values((await res.json())?.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    for (const pg of pages) {
      const ii = pg.imageinfo?.[0];
      const meta = ii?.extmetadata || {};
      const license = stripHtml(meta.LicenseShortName?.value);
      if (!ii?.thumburl || (ii.width || 0) < 700) continue;
      if (!/public domain|^pd|cc0|cc by/i.test(license)) continue; // free licences only
      const img = await fetch(ii.thumburl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 10_000) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return { title: stripHtml(pg.title).replace(/^File:/, ""), artist: stripHtml(meta.Artist?.value) || "unknown", license, url: ii.descriptionurl };
    }
    console.warn(`  commons: no freely-licensed match for "${query}"`);
  } catch (e) {
    console.warn(`  commons failed: ${e.message}`);
  }
  return null;
}

// Per beat: search → src (real archival photo), else prompt → src (AI image); same for search2/prompt2 → src2.
job.credits = [];
for (const [i, b] of job.beats.entries()) {
  for (const [qk, pk, sk, tag] of [["search", "prompt", "src", ""], ["search2", "prompt2", "src2", "b"]]) {
    const p = b.props || {};
    if (p[sk] || (!p[qk] && !p[pk])) continue;
    const base = `gen/${job.id || "job"}-${i}${tag}`;
    let got = null;
    if (p[qk]) {
      console.log(`beat ${i}: archival photo for "${p[qk]}"`);
      const credit = await fetchCommons(p[qk], path.join("public", `${base}.jpg`));
      if (credit) { got = `${base}.jpg`; job.credits.push({ beat: i, ...credit }); console.log(`  → ${credit.title} (${credit.license}, ${credit.artist})`); }
    }
    if (!got && p[pk]) {
      console.log(`beat ${i}: AI image for "${p[pk]}"`);
      if (await fetchImage(p[pk], path.join("public", `${base}-ai.jpg`), (job.seed || 1) * 100 + i * 2 + (tag ? 1 : 0))) got = `${base}-ai.jpg`;
    }
    if (got) b.props = { ...p, [sk]: got };
    else console.log("  → no image; the primitive renders its no-image look");
  }
}
if (job.credits.length) {
  const lines = ["### Image credits (put CC BY / BY-SA ones in the caption)", ...job.credits.map((c) => `- ${c.title} — ${c.artist} · ${c.license} · ${c.url}`)];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

// off (default) = CSS cuts only, ~4 min. on = real WebGL shader cuts on big beats, ~18 min.
// (Measured: any shader cut makes Remotion render the WHOLE adjacent scenes via HTML-in-canvas at
// ~5-9 s/frame on CPU runners, so even a 3-cut budget took 18 min — it's all-or-nothing.)
const mode = process.env.SHADERS || "off";
const shaders = mode === "on" || mode === "max" || mode === "auto";
if (shaders && job.shaderCuts === undefined) job.shaderCuts = 99;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ job, shaders }, null, 2));
console.log(`props → ${outPath} · ${job.beats.length} beats · theme=${job.theme} · seed=${job.seed} · shaders=${shaders}`);
console.log("primitives:", job.beats.map((b) => b.primitive).join(" → "));
