/**
 * THE ONE-SPINE SCHEMA + GATES.
 *
 * book.json is the single source of truth for a run. Each phase fills in its slice and must pass the
 * gate for that phase before the next phase runs — exactly like `npm run validate` in the video pipeline.
 * A gate failing is a STOP, never a silent skip: that is what keeps a 60-page book coherent and honest.
 *
 * Shape (fields added progressively by each phase):
 * {
 *   meta:   { id, topic, subtitle, audience, brand, accent, targetPages, createdAt },
 *   thesis: "central argument of the whole book (1 short paragraph)",
 *   evidence: [ { id:"E1", claim, detail, url, source, kind:"paper|web|data", numeric:{value,unit}|null } ],
 *   outline: { chapters: [ { id:"C1", title, summary, sections: [ {
 *       id:"S1", title, thesis, evidenceIds:["E1"],
 *       visual: { kind, title, spec:{...}, evidenceIds:[] },   // graphic-first: decided BEFORE prose
 *       content: { paragraphs:[ {text, sourceIds:["E1"]} ], pullQuote },  // filled by writer
 *       template: "opener|figure|twocol|fulldata|pullquote|divider",       // assigned by layout
 *       status: "planned|written|verified"
 *   } ] } ] },
 *   graphics: { "S1": { kind, caption, svg?, imagePath? } },
 *   stages:  { research, architect, write, verify, graphics, layout, render }   // checkpoint booleans
 * }
 */

export const VISUAL_KINDS = [
  "chart", "timeline", "matrix", "flow", "bigstat", "statgrid",
  "diagram", "conceptmap", "quote", "table", "image", "none",
];
export const TEMPLATES = ["opener", "figure", "twocol", "fulldata", "pullquote", "divider"];

export function newSpine(meta) {
  return {
    meta: {
      id: meta.id, topic: meta.topic, subtitle: meta.subtitle || "",
      audience: meta.audience || "technical leaders and builders",
      brand: meta.brand || "HASSAN KHAN", accent: meta.accent || "#4f8cff",
      targetPages: meta.targetPages || 60, createdAt: meta.createdAt || "",
    },
    thesis: "",
    evidence: [],
    outline: { chapters: [] },
    graphics: {},
    stages: { research: false, architect: false, write: false, verify: false, graphics: false, layout: false, render: false },
  };
}

/* ---------- traversal helpers ---------- */
export function allSections(spine) {
  const out = [];
  for (const c of spine.outline?.chapters || []) for (const s of c.sections || []) out.push({ chapter: c, section: s });
  return out;
}
export function evidenceMap(spine) {
  const m = new Map();
  for (const e of spine.evidence || []) m.set(e.id, e);
  return m;
}

/* ---------- gates (return {ok, errors:[]}) ---------- */
const fail = (errors) => ({ ok: errors.length === 0, errors });

export function gateResearch(spine, { minEvidence = 12 } = {}) {
  const e = [];
  const ev = spine.evidence || [];
  if (ev.length < minEvidence) e.push(`only ${ev.length} evidence items (need >= ${minEvidence})`);
  const noUrl = ev.filter((x) => !x.url).length;
  if (noUrl) e.push(`${noUrl} evidence items have no source URL`);
  const noClaim = ev.filter((x) => !x.claim || x.claim.length < 8).length;
  if (noClaim) e.push(`${noClaim} evidence items have no real claim`);
  if (!spine.thesis || spine.thesis.length < 40) e.push("book thesis is missing/too short");
  return fail(e);
}

export function gateOutline(spine, { minChapters = 5, minSections = 18 } = {}) {
  const e = [];
  const ch = spine.outline?.chapters || [];
  if (ch.length < minChapters) e.push(`only ${ch.length} chapters (need >= ${minChapters})`);
  const secs = allSections(spine);
  if (secs.length < minSections) e.push(`only ${secs.length} sections (need >= ${minSections})`);
  const ids = evidenceMap(spine);
  for (const { section: s } of secs) {
    if (!s.id) e.push("a section has no id");
    if (!s.thesis) e.push(`section ${s.id} has no thesis`);
    if (!s.visual || !VISUAL_KINDS.includes(s.visual.kind)) e.push(`section ${s.id} has no valid visual.kind`);
    for (const id of s.evidenceIds || []) if (!ids.has(id)) e.push(`section ${s.id} cites unknown evidence ${id}`);
  }
  return fail(e);
}

export function gateWritten(spine) {
  const e = [];
  for (const { section: s } of allSections(spine)) {
    const paras = s.content?.paragraphs || [];
    if (!paras.length) e.push(`section ${s.id} has no written paragraphs`);
    const words = paras.map((p) => (p.text || "").split(/\s+/).length).reduce((a, b) => a + b, 0);
    if (paras.length && words < 40) e.push(`section ${s.id} is too thin (${words} words)`);
  }
  return fail(e);
}

export function gateVerified(spine) {
  const e = [];
  const ids = evidenceMap(spine);
  let unresolved = 0;
  for (const { section: s } of allSections(spine)) {
    for (const p of s.content?.paragraphs || []) {
      for (const sid of p.sourceIds || []) if (!ids.has(sid)) unresolved++;
    }
    if (s.status !== "verified") e.push(`section ${s.id} not marked verified`);
  }
  if (unresolved) e.push(`${unresolved} paragraph citations point to unknown evidence`);
  return fail(e);
}

export function gateGraphics(spine) {
  const e = [];
  for (const { section: s } of allSections(spine)) {
    const kind = s.visual?.kind;
    if (!kind || kind === "none") continue;
    const g = spine.graphics?.[s.id];
    if (!g || (!g.svg && !g.imagePath)) e.push(`section ${s.id} (visual ${kind}) has no rendered graphic`);
  }
  return fail(e);
}

export function report(name, res) {
  if (res.ok) { console.log(`  ✓ gate:${name} passed`); return true; }
  console.log(`  ✗ gate:${name} FAILED:`);
  for (const x of res.errors.slice(0, 20)) console.log(`      - ${x}`);
  if (res.errors.length > 20) console.log(`      … +${res.errors.length - 20} more`);
  return false;
}
