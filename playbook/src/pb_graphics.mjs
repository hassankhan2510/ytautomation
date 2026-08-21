/**
 * PHASE 5 — GRAPHICS (the Visual Router).
 *
 * For each section, turn the architect's visual intent into a REAL, evidence-grounded graphic:
 *   - data/logic kinds (chart, bigstat, statgrid, table)  -> spec numbers must come from cited evidence;
 *   - structure kinds (flow, diagram, matrix, timeline, conceptmap, compare, quote) -> code-drawn SVG;
 *   - "image" (atmosphere / chapter openers only)         -> free AI image (Pollinations), downloaded.
 * Everything is VECTOR SVG (razor-sharp, zero raster) except the rare atmospheric image. A fail-safe
 * fallback guarantees every section gets a graphic (never a broken figure in the book).
 *
 *   PB_ID=gnn node src/pb_graphics.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { llmJSON, setBudgetFile } from "./pb_llm.mjs";
import { gateGraphics, report, allSections, evidenceMap } from "./pb_schema.mjs";
import { PRIMITIVES, quote as quotePrim, diagram as diagramPrim } from "./pb_graphics_lib.mjs";
import { loadSpine, saveSpine, runPaths, fetchText, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
const FORCE = !!arg("force", false);
const NO_IMAGES = !!arg("no-images", process.env.PB_NO_IMAGES);
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

const SCHEMA = {
  chart: `{"title","type":"bar"|"line","data":[{"label","value":number}],"source"}`,
  bigstat: `{"value":"e.g. 79%","label","sub"}`,
  statgrid: `{"title","stats":[{"value","label"}]}`,
  timeline: `{"title","events":[{"when","what"}]}`,
  matrix: `{"title","xLabel","yLabel","quadrants":[{"label","note"} x4]}`,
  flow: `{"title","steps":["..."]}`,
  diagram: `{"title","core","parts":["..."]}`,
  conceptmap: `{"title","center","nodes":["..."]}`,
  compare: `{"title","left":{"title","items":[]},"right":{"title","items":[]}}`,
  table: `{"title","headers":["A","B"],"rows":[["..","..'"]]}`,
  quote: `{"text","author","role"}`,
};
const NUMERIC = new Set(["chart", "bigstat", "statgrid", "table"]);

function evBlock(section, emap) {
  return (section.evidenceIds || []).map((id) => emap.get(id)).filter(Boolean)
    .map((e) => `${e.id}: ${e.claim}${e.numeric ? ` [${e.numeric.value} ${e.numeric.unit}]` : ""}`).join("\n") || "(none)";
}

async function buildSpec(section, kind, emap) {
  const sys = `You produce the DATA SPEC for one figure in a premium book. Return ONLY JSON matching this schema for
kind "${kind}": ${SCHEMA[kind] || SCHEMA.diagram}.
RULES:
- Be SPECIFIC to this section's real content. Every label must be a REAL, concrete concept, entity, mechanism,
  or step from the section/evidence — never a placeholder like "Key idea", "Concept", "Point", "Idea", or a
  single vague word. If you cannot produce specific, meaningful labels, return {} so a cleaner figure is used.
- LABELS MUST BE SHORT: a "core"/"center" is at most 3 words; each node/part/step/quadrant label at most 4 words.
  NEVER put a sentence inside a node, hub, or cell — and never a trailing colon. These are labels, not prose.
- For "diagram"/"conceptmap": give at least 3 distinct, specific nodes and a specific core (not the section title reworded).
- ${NUMERIC.has(kind) ? "Use ONLY numbers that appear in the evidence. If the evidence has no usable numbers, return {} so a non-numeric figure is used instead." : "Do not invent statistics."}
No commentary.`;
  const usr = `SECTION: ${section.title}\nPOINT: ${section.thesis}\nFIGURE INTENT: ${section.visual?.dataHint || ""}\nEVIDENCE:\n${evBlock(section, emap)}`;
  return await llmJSON(sys, usr, { tier: "mid", maxTokens: 900, temperature: 0.3 });
}

function render(kind, spec, accent) {
  const fn = PRIMITIVES[kind];
  if (!fn) return null;
  try { return fn(spec, accent); } catch { return null; }
}

// Never leave a section without a figure, and NEVER fabricate a word-salad diagram: fall back to a clean
// typographic pull-quote drawn from the section's own writing (its pull-quote, thesis, or title).
function fallbackSvg(section, accent) {
  const pq = section.content?.pullQuote || section.thesis || section.title;
  return quotePrim({ text: pq, author: "", role: "" }, accent);
}

async function aiImage(section, dir, accent) {
  const prompt = `editorial abstract concept art, ${section.visual?.dataHint || section.title}, minimal, premium, muted palette, negative space, no text, no words`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1600&height=1000&nologo=true&model=flux`;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 8000) throw new Error("image too small (likely error)");
    const rel = path.join("graphics", `${section.id}.jpg`);
    fs.writeFileSync(path.join(dir, rel), buf);
    return rel.replace(/\\/g, "/");
  } catch (e) { log(`  ! AI image failed for ${section.id} (${e.message}) — using typographic figure`); return null; }
}

async function main() {
  const p = runPaths(ID); setBudgetFile(p.budget);
  const spine = loadSpine(ID);
  if (!spine.stages.verify) log("  (note: verify not complete — rendering graphics anyway)");
  const accent = spine.meta.accent || "#4f8cff";
  const emap = evidenceMap(spine);
  spine.graphics = spine.graphics || {};
  log(`GRAPHICS id=${ID}`);

  const secs = allSections(spine);
  let made = 0, imgs = 0, fell = 0;
  for (let i = 0; i < secs.length; i++) {
    const { section } = secs[i];
    let kind = section.visual?.kind;
    if (!kind || kind === "none") continue;
    if (spine.graphics[section.id] && (spine.graphics[section.id].svg || spine.graphics[section.id].imagePath) && !FORCE) continue;

    if (kind === "image") {
      const rel = NO_IMAGES ? null : await aiImage(section, p.dir, accent);
      if (rel) { spine.graphics[section.id] = { kind: "image", caption: section.visual.title || section.title, imagePath: rel }; imgs++; }
      else { spine.graphics[section.id] = { kind: "quote", caption: section.visual.title || section.title, svg: fallbackSvg(section, accent) }; fell++; }
      saveSpine(ID, spine); continue;
    }

    const spec = await buildSpec(section, kind, emap).catch(() => null);
    let out = spec ? render(kind, spec, accent) : null;

    // A figure that can't be built from real content (no numbers for a chart, too-generic labels for a
    // diagram) becomes a clean pull-quote — never a fabricated "Key idea" word-salad.
    if (!out) { out = fallbackSvg(section, accent); kind = "quote"; fell++; }
    else made++;

    section.visual.spec = spec || null;
    spine.graphics[section.id] = { kind, caption: section.visual.title || section.title, svg: out };
    saveSpine(ID, spine);
    if ((i + 1) % 5 === 0) log(`  … ${i + 1}/${secs.length} figures`);
  }

  spine.stages.graphics = true;
  saveSpine(ID, spine);
  const g = gateGraphics(spine);
  report("graphics", g);
  log(`  vector figures ${made}, AI images ${imgs}, fallbacks ${fell}`);
  if (!g.ok) process.exit(2);
}
main().catch((e) => { console.error("graphics failed:", e.message); process.exit(1); });
