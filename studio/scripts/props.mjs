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
if ((process.env.MUSIC || "auto") === "none") delete job.music;
if ((process.env.SFX || "on") === "off") job.sfx = false;

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
 * MEDIA JUDGE (shared by scene images and backgrounds) — one LLM call scores every scene's candidates
 * 0-10 for how clearly they show THAT line's subject within the reel's subject. Only a score >= 7 is
 * used; otherwise the scene gets nothing (its clean no-image look / the generated backdrop).
 * Wrong media is worse than no media: a stock-market reel once got rebar and paper textures, a random
 * portrait for "investors", and a Taj Mahal reel got chained hands for "workers".
 */
const SUBJECT = String(job.subject || job.title || "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
async function judgeMedia(scenes, what) {
  if (!scenes.some((s) => s.c.length)) return new Map();
  const { groqJSON } = await import("../../theranos-doc/scripts/lib_groq.mjs");
  const res = await groqJSON(
    `You are a strict PHOTO EDITOR for a factual video. For each SCENE, score every candidate 0-10 for how clearly its description shows the subject or context of THAT spoken line, inside the reel's SUBJECT, and pick the best.
Score 7+ ONLY if it literally depicts the line's subject (e.g. a stock chart or trading floor for a markets line; the actual monument for a monument line).
Score LOW (0-3): abstract textures, patterns, generic "mood"/background shots; random people, portraits or offices not specific to the line; a different place, country, landmark, era or event; anything implying a claim the line doesn't make (chains/slavery for "workers", a crash for "growth"); brand logos; identifiable public figures; disturbing imagery.
Each candidate may be used once in the whole reel.
Return ONLY JSON: {"picks":[{"scene":n,"pick":candidate number or -1,"score":0-10,"why":"max 8 words"}]}`,
    `SUBJECT OF THE REEL: ${SUBJECT || "(see lines)"}\nMEDIA TYPE: ${what}\n\n` +
      scenes.map((s) => `SCENE ${s.n} — line: "${s.line}" (search: ${s.q})\n${s.c.map((c, k) => `  ${k + 1}. [${c.kind}] ${c.desc}`).join("\n") || "  (no candidates)"}`).join("\n\n"),
    { maxTokens: 1800, temperature: 0.1 },
  );
  return new Map(
    (res?.picks || []).map((p) => [Number(p.scene), { pick: Number(p.pick), score: Number(p.score) || 0, why: String(p.why || "") }]),
  );
}
const MIN_SCORE = Number(process.env.MEDIA_MIN_SCORE || 7);

/**
 * REAL archival photos from Wikimedia Commons (free licences: public domain / CC0 / CC BY / CC BY-SA),
 * now as CANDIDATES (title + description) for the judge instead of "first result wins".
 */
const UA = "StudioReelRenderer/1.0 (automated render job; GitHub Actions)";
const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
async function commonsCandidates(query) {
  try {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280`;
    const res = await fetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`search HTTP ${res.status}`);
    const pages = Object.values((await res.json())?.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const out = [];
    for (const pg of pages) {
      const ii = pg.imageinfo?.[0];
      const meta = ii?.extmetadata || {};
      const license = stripHtml(meta.LicenseShortName?.value);
      if (!ii?.thumburl || (ii.width || 0) < 700) continue;
      if (!/public domain|^pd|cc0|cc by/i.test(license)) continue; // free licences only
      const title = stripHtml(pg.title).replace(/^File:/, "").replace(/\.[a-z]{3,4}$/i, "");
      const desc = `${title} — ${stripHtml(meta.ImageDescription?.value).slice(0, 140)}`;
      out.push({ kind: "photo", id: `c${pg.pageid}`, desc, link: ii.thumburl, credit: { title, artist: stripHtml(meta.Artist?.value) || "unknown", license, url: ii.descriptionurl } });
      if (out.length >= 6) break;
    }
    return out;
  } catch (e) {
    console.warn(`  commons failed for "${query}": ${e.message}`);
    return [];
  }
}
async function downloadTo(url, file, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 10_000) throw new Error("file too small");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

// Scene images: search -> judged archival photo; else prompt -> AI image; same for search2/prompt2 -> src2.
job.credits = [];
{
  const slots = [];
  for (const [i, b] of job.beats.entries()) {
    for (const [qk, pk, sk, tag] of [["search", "prompt", "src", ""], ["search2", "prompt2", "src2", "b"]]) {
      const p = b.props || {};
      if (p[sk] || (!p[qk] && !p[pk])) continue;
      slots.push({ i, b, qk, pk, sk, tag, q: String(p[qk] || ""), line: String(b.text || "") });
    }
  }
  const scenes = [];
  for (const s of slots) scenes.push({ ...s, n: scenes.length + 1, c: s.q ? await commonsCandidates(s.q) : [] });
  let picks = new Map();
  try { picks = await judgeMedia(scenes, "archival/reference photos shown inside the scene"); } catch (e) { console.warn(`  image judge failed (${e.message}) — scenes use their no-image look`); }
  const used = new Set();
  let ok = 0, none = 0;
  for (const s of scenes) {
    const base = `gen/${job.id || "job"}-${s.i}${s.tag}`;
    const p = picks.get(s.n);
    const cand = p && p.pick >= 1 && p.score >= MIN_SCORE ? s.c[p.pick - 1] : null;
    let got = null;
    if (cand && !used.has(cand.id)) {
      try {
        await downloadTo(cand.link, path.join("public", `${base}.jpg`), { "User-Agent": UA });
        got = `${base}.jpg`;
        used.add(cand.id);
        job.credits.push({ beat: s.i, ...cand.credit });
        console.log(`beat ${s.i}: photo "${cand.desc.slice(0, 70)}" ✓ ${p.score}/10 (${p.why})`);
      } catch (e) {
        console.warn(`beat ${s.i}: photo download failed (${e.message})`);
      }
    }
    const pr = (s.b.props || {})[s.pk];
    if (!got && pr) {
      console.log(`beat ${s.i}: AI image for "${pr}"`);
      if (await fetchImage(pr, path.join("public", `${base}-ai.jpg`), (job.seed || 1) * 100 + s.i * 2 + (s.tag ? 1 : 0))) got = `${base}-ai.jpg`;
    }
    if (got) { s.b.props = { ...(s.b.props || {}), [s.sk]: got }; ok++; }
    else { none++; console.log(`beat ${s.i}: no fitting image for "${s.q}"${p?.why ? ` (${p.why})` : ""} — scene uses its no-image look`); }
  }
  if (scenes.length) {
    const msg = `🖼️ Image judge: ${ok} scene image(s) matched · ${none} without a fitting image (no-image look)`;
    console.log(msg);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + "\n");
  }
}
/**
 * REAL BACKGROUNDS — every scene gets stock footage that matches what's being said (Pexels: free,
 * commercial use, no attribution required; credited anyway). Vertical video first, vertical photo
 * second, the generated backdrop only as a last resort. No asset repeats within a reel.
 * BG_MODE = video (default) | photo | off.   Needs PEXELS_API_KEY.
 */
const BG_MODE = (process.env.BG_MODE || "video").toLowerCase();
const PEXELS = process.env.PEXELS_API_KEY || "";
const OWN_BACKDROP = new Set(["museumFrame", "redString", "photo", "parallax", "outro"]); // these paint their own full background
const STOP = new Set("the a an and or but of to in on for with at by from is are was were be been it its this that these those as into than then so such just very can will would could should about over after before your you our we they them their there here what when where which who why how not no yes do does did have has had more most much many some any each every all one two three".split(" "));
const bgQuery = (b) => {
  if (b.bg) return String(b.bg);
  const words = String(b.text || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const topic = String(job.subject || job.title || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  // No director query (e.g. the scene was swapped by the fact guard) → anchor on the reel's subject.
  return [...new Set([...topic.slice(0, 2), ...words.sort((x, y) => y.length - x.length).slice(0, 1)])].join(" ") || "abstract light";
};
async function pexels(url) {
  const r = await fetch(url, { headers: { Authorization: PEXELS }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`pexels HTTP ${r.status}`);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 20_000) throw new Error("file too small");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
if (BG_MODE !== "off" && PEXELS) {
  /* FOOTAGE JUDGE — never take the first stock result blindly. Gather several candidates per scene
   * (with their real descriptions: photo alt text / the video's descriptive URL slug), then ONE LLM call
   * picks, for every scene, only footage that clearly shows that line's subject/context — or none.
   * Wrong footage is worse than no footage (a stock-market reel once showed unrelated clips; a Taj Mahal
   * reel showed chained hands for "workers"). Rejected scenes get one subject-anchored retry, then fall
   * back to the generated backdrop. */
  const slugDesc = (url) => decodeURIComponent(String(url || "").split("/").filter(Boolean).pop() || "").replace(/-\d+$/, "").replace(/-/g, " ");
  const subject = SUBJECT;
  async function candidatesFor(q) {
    const out = [];
    try {
      if (BG_MODE === "video") {
        const d = await pexels(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=15`);
        for (const v of d.videos || []) {
          if (v.duration < 6) continue;
          const file = (v.video_files || []).filter((f) => f.file_type === "video/mp4" && f.height > f.width && f.height >= 960 && f.height <= 1920).sort((x, y) => Math.abs(x.height - 1280) - Math.abs(y.height - 1280))[0];
          if (file) out.push({ kind: "video", id: `v${v.id}`, desc: slugDesc(v.url), link: file.link, w: file.width, h: file.height, credit: { title: `Pexels video ${v.id}`, artist: v.user?.name || "Pexels", license: "Pexels License", url: v.url } });
          if (out.length >= 6) break;
        }
      }
      const p = await pexels(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=15`);
      for (const x of (p.photos || []).slice(0, 6)) {
        out.push({ kind: "image", id: `p${x.id}`, desc: String(x.alt || slugDesc(x.url)), link: `${x.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920`, credit: { title: `Pexels photo ${x.id}`, artist: x.photographer || "Pexels", license: "Pexels License", url: x.url } });
      }
    } catch (e) {
      console.warn(`  candidates for "${q}" failed: ${e.message}`);
    }
    return out;
  }
  const judge = (scenes) => judgeMedia(scenes, "full-screen background footage/photo behind the scene");
  const usedIds = new Set();
  const todo = job.beats.map((b, i) => ({ b, i })).filter(({ b }) => !OWN_BACKDROP.has(b.primitive) && !b.bgSrc && String(b.text || "").trim());
  let got = 0, rejected = 0;
  for (const round of [1, 2]) {
    if (!todo.length) break;
    const scenes = [];
    for (const { b, i } of todo) {
      // Round 2: anchor the search on the reel's subject + the line's main words.
      const q = round === 1 ? bgQuery(b) : [subject.split(" ").slice(0, 3).join(" "), bgQuery({ text: b.text, title: "" })].join(" ").trim();
      const c = (await candidatesFor(q)).filter((x) => !usedIds.has(x.id));
      scenes.push({ n: scenes.length + 1, b, i, q, line: String(b.text), c });
    }
    let picks = new Map();
    try { picks = await judge(scenes); } catch (e) { console.warn(`  footage judge failed (${e.message}) — scenes keep the generated backdrop`); }
    const next = [];
    for (const s of scenes) {
      const p = picks.get(s.n);
      const cand = p && p.pick >= 1 && p.score >= MIN_SCORE ? s.c[p.pick - 1] : null;
      if (!cand || usedIds.has(cand.id)) {
        if (round === 1) next.push({ b: s.b, i: s.i });
        else { rejected++; console.log(`beat ${s.i}: no fitting footage ("${s.q}") — generated backdrop${p?.why ? ` (${p.why})` : ""}`); }
        continue;
      }
      const base = `bg/${job.id || "job"}-${s.i}`;
      const file = `${base}.${cand.kind === "video" ? "mp4" : "jpg"}`;
      try {
        await download(cand.link, path.join("public", file));
        Object.assign(s.b, { bgSrc: file, bgKind: cand.kind });
        usedIds.add(cand.id);
        job.credits.push({ beat: s.i, ...cand.credit });
        got++;
        console.log(`beat ${s.i}: ${cand.kind} "${cand.desc}" ✓ ${p.score}/10 (${p.why})`);
      } catch (e) {
        if (round === 1) next.push({ b: s.b, i: s.i });
        else console.warn(`beat ${s.i}: download failed (${e.message}) — generated backdrop`);
      }
    }
    todo.splice(0, todo.length, ...next);
  }
  const msg = `🎞️ Footage judge: ${got} scene(s) got matching footage · ${rejected} kept the generated backdrop (nothing fit)`;
  console.log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + "\n");
} else if (BG_MODE !== "off") {
  console.warn("PEXELS_API_KEY not set — scenes use the generated backdrop");
}

// Music credit (CC BY tracks require it in the caption/description).
if (job.music) {
  try {
    const cat = JSON.parse(fs.readFileSync("public/music/catalog.json", "utf8"));
    const t = cat.tracks.find((x) => x.file === job.music);
    if (t) job.credits.push({ beat: "music", title: t.title, artist: t.artist, license: t.license, url: t.sourceUrl });
    if (!fs.existsSync(path.join("public", job.music))) { console.warn(`music ${job.music} not found — rendering without music`); delete job.music; }
  } catch (e) { console.warn("music catalog:", e.message); }
}
if (job.credits.length) {
  const lines = ["### Credits — images + music (put CC BY / BY-SA ones in the caption)", ...job.credits.map((c) => `- ${c.title} — ${c.artist} · ${c.license} · ${c.url}`)];
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
