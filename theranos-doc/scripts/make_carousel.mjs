/**
 * REPURPOSE: turn a video script into a LinkedIn / Instagram CAROUSEL.
 *
 * Reads   src/data/script.json  (the job currently swapped in by batch)
 * Writes  src/data/carousel.json (slide data the Carousel composition renders)
 *         out/<name>_slide_01..N.jpg   (Instagram — post as a multi-image carousel)
 *         out/<name>_carousel.pdf      (LinkedIn — post as a native document/carousel)
 *
 * Slide copy: if GROQ_API_KEY is set it rewrites the script into punchy slides; otherwise it
 * falls back to a deterministic distillation of the script (no API needed). $0, no new deps —
 * slides render through Remotion, the PDF is written by a tiny built-in JPEG-embedding writer.
 *
 * Run:  node scripts/make_carousel.mjs <outName>
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCRIPT_JSON = path.join(ROOT, "src", "data", "script.json");
const CAROUSEL_JSON = path.join(ROOT, "src", "data", "carousel.json");
const OUT = path.join(ROOT, "out");

const NAME = process.argv[2] || "carousel";
const MAX_POINTS = 7;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const SCRATCH = process.platform === "win32" ? "D:/remotion-temp" : path.join(os.tmpdir(), "remotion-temp");
const ENV = { ...process.env, TMP: SCRATCH, TEMP: SCRATCH, TMPDIR: SCRATCH };

const clip = (s, n) => {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/* ---------- build slide copy ---------- */
async function groqSlides(meta, lines) {
  if (!GROQ_API_KEY) return null;
  const sys =
    "You turn a video script into a punchy LinkedIn/Instagram carousel. Return JSON only: " +
    `{ "slides": [ { "headline": string (<= 6 words, no period), "body": string (<= 180 chars) } ] } ` +
    `with 5-${MAX_POINTS} slides. Each slide = one idea, concrete, valuable, skimmable. No hashtags, no emojis.`;
  const user =
    `TITLE: ${meta.title || ""}\nSCRIPT LINES:\n` +
    JSON.stringify(lines.map((l) => l.caption || l.text).slice(0, 40));
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.5,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const slides = (parsed.slides || [])
      .filter((s) => s && s.headline)
      .slice(0, MAX_POINTS)
      .map((s) => ({ headline: clip(s.headline, 60), body: clip(s.body, 200) }));
    return slides.length >= 3 ? slides : null;
  } catch (e) {
    console.log(`  ! carousel Groq pass failed (${e.message}) — using deterministic slides.`);
    return null;
  }
}

// No-API fallback: distil the strongest lines into slides.
function heuristicSlides(lines) {
  const scored = lines
    .map((l) => ({ l, score: (l.kicker ? 2 : 0) + (l.stat ? 2 : 0) + (l.percent != null ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  const pick = (scored.some((s) => s.score > 0) ? scored : lines.map((l) => ({ l, score: 0 })))
    .slice(0, MAX_POINTS)
    .map(({ l }) => {
      const text = l.caption || l.text || "";
      const headline = l.kicker || l.stat || text.split(/\s+/).slice(0, 5).join(" ");
      return { headline: clip(headline, 60), body: clip(text, 200) };
    });
  return pick;
}

function buildCarousel(meta, points) {
  const brand = meta.brand || (meta.channel || "").toUpperCase();
  return {
    accentColor: meta.accentColor || "#e11d48",
    brand,
    tagline: meta.tagline || "",
    slides: [
      { kind: "cover", headline: clip(meta.title || brand, 70), sub: `A ${points.length}-part breakdown` },
      ...points.map((p, i) => ({ kind: "point", n: i + 1, headline: p.headline, body: p.body })),
      {
        kind: "cta",
        headline: "Found this useful?",
        body: clip(meta.description || `Follow ${brand} for more, one post at a time.`, 200),
      },
    ],
  };
}

// When the script is a chart-based analysis reel, make a CHART carousel: cover -> the real charts
// (1H/4H/Daily/Weekly) -> a save-me CTA. Highly saveable "today's levels" reference.
function buildChartCarousel(meta, scenes) {
  const brand = meta.brand || (meta.channel || "").toUpperCase();
  const name = scenes[0].assetName || meta.title || brand;
  const date = scenes[0].dateLabel || "";
  const toChart = (s) => ({
    kind: "chart", candles: s.candles, overlays: s.overlays || [], levels: s.levels || [],
    name: s.assetName, pair: s.pair, timeframe: s.timeframe, price: s.priceNow,
    changePct: s.changePct, decimals: s.decimals, callout: s.callout, dateLabel: s.dateLabel,
  });
  // One chart per distinct timeframe, in order.
  const order = ["1h", "4h", "daily", "weekly"];
  const chosen = order
    .map((p) => scenes.find((s) => String(s.timeframe || "").toLowerCase().startsWith(p)))
    .filter(Boolean);
  const chartSlides = (chosen.length ? chosen : scenes.slice(0, 4)).map(toChart);
  return {
    accentColor: meta.accentColor || "#10b981",
    brand, tagline: meta.tagline || "",
    slides: [
      { kind: "cover", headline: `${name} — Today's Levels`, sub: date },
      ...chartSlides,
      { kind: "cta", headline: "Save this for the session", body: clip(meta.description || `Follow ${brand} for daily market levels & analysis.`, 200) },
    ],
  };
}

/* ---------- render slides + assemble PDF ---------- */
function renderSlides(count) {
  const framesDir = path.join(OUT, `_carousel_${NAME}`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  execSync(
    `npx remotion render Carousel "${framesDir}" --sequence --image-format=jpeg --frames=0-${count - 1} --concurrency=4`,
    { cwd: ROOT, env: ENV, stdio: "inherit" },
  );
  // Collect the rendered frames in numeric order.
  const files = fs
    .readdirSync(framesDir)
    .filter((f) => /\.(jpe?g)$/i.test(f))
    .map((f) => ({ f, n: parseInt((f.match(/(\d+)/) || [])[1] ?? "0", 10) }))
    .sort((a, b) => a.n - b.n)
    .map((x) => path.join(framesDir, x.f));
  return { framesDir, files };
}

// Read a JPEG's pixel dimensions + component count from its SOF marker.
function jpegInfo(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { w: 1080, h: 1080, comps: 3 };
}

// Minimal PDF writer: one full-page per JPEG, embedded via DCTDecode (no re-encoding, no deps).
function imagesToPdf(jpegPaths, outPdf) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (s) => {
    const b = Buffer.isBuffer(s) ? s : Buffer.from(s, "latin1");
    chunks.push(b);
    pos += b.length;
  };
  const obj = (id, body) => {
    offsets[id] = pos;
    push(`${id} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  const N = jpegPaths.length;
  const pageIds = [];
  let next = 3;
  const objs = [];
  for (let k = 0; k < N; k++) {
    const jpeg = fs.readFileSync(jpegPaths[k]);
    const { w, h, comps } = jpegInfo(jpeg);
    const pageId = next++, contentId = next++, imgId = next++;
    pageIds.push(pageId);
    const cs = comps === 1 ? "/DeviceGray" : comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    objs.push({ id: pageId, body: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${w} ${h}]/Resources<</XObject<</Im0 ${imgId} 0 R>>>>/Contents ${contentId} 0 R>>` });
    objs.push({ id: contentId, body: `<</Length ${content.length}>>\nstream\n${content}\nendstream` });
    objs.push({ id: imgId, jpeg, header: `<</Type/XObject/Subtype/Image/Width ${w}/Height ${h}/ColorSpace ${cs}/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>` });
  }

  push("%PDF-1.7\n");
  obj(1, "<</Type/Catalog/Pages 2 0 R>>");
  obj(2, `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(" ")}]/Count ${N}>>`);
  for (const o of objs) {
    if (o.jpeg) {
      offsets[o.id] = pos;
      push(`${o.id} 0 obj\n`);
      push(o.header);
      push("\nstream\n");
      push(o.jpeg);
      push("\nendstream\nendobj\n");
    } else {
      obj(o.id, o.body);
    }
  }
  const xrefPos = pos;
  const total = next;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) {
    xref += `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF\n`);

  fs.writeFileSync(outPdf, Buffer.concat(chunks));
}

/* ---------- main ---------- */
async function main() {
  const script = JSON.parse(fs.readFileSync(SCRIPT_JSON, "utf-8"));
  const meta = script.meta || {};
  const lines = script.lines || [];
  if (!lines.length) { console.log("  (carousel skipped — no lines)"); return; }

  // Chart-based analysis reels -> a real CHART carousel; everything else -> the text carousel.
  const candleScenes = lines.filter((l) => l.layout === "candles" && Array.isArray(l.candles) && l.candles.length);
  let carousel;
  if (candleScenes.length >= 2) {
    carousel = buildChartCarousel(meta, candleScenes);
    console.log(`  carousel: chart mode (${carousel.slides.length} slides)`);
  } else {
    const points = (await groqSlides(meta, lines)) || heuristicSlides(lines);
    carousel = buildCarousel(meta, points);
  }
  fs.writeFileSync(CAROUSEL_JSON, JSON.stringify(carousel, null, 2));

  const { framesDir, files } = renderSlides(carousel.slides.length);
  if (!files.length) { console.log("  ! carousel render produced no frames — skipping."); return; }

  // Copy slides out with friendly names for Instagram.
  fs.mkdirSync(OUT, { recursive: true });
  files.forEach((f, i) => {
    fs.copyFileSync(f, path.join(OUT, `${NAME}_slide_${String(i + 1).padStart(2, "0")}.jpg`));
  });
  // Assemble the LinkedIn PDF.
  try {
    imagesToPdf(files, path.join(OUT, `${NAME}_carousel.pdf`));
    console.log(`  + out/${NAME}_carousel.pdf  (${files.length} slides)`);
  } catch (e) {
    console.log(`  ! PDF assembly failed (${e.message}) — JPEG slides still delivered.`);
  }
  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`  + out/${NAME}_slide_01..${String(files.length).padStart(2, "0")}.jpg`);
}

main().catch((e) => { console.log(`  ! carousel failed (${e.message}) — video is unaffected.`); });
