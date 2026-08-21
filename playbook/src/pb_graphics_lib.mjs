/**
 * VECTOR GRAPHIC PRIMITIVES — the Visual Router's toolbox.
 *
 * Each function takes a validated spec and returns a self-contained, editorial-grade SVG string (vector,
 * so it renders razor-sharp at any size in the PDF, at zero compute cost). Designed for a LIGHT, premium
 * "whitepaper / Vogue" page: warm paper, near-black ink, one accent, generous negative space, Playfair +
 * Inter typography. No external assets — fonts are loaded by the HTML page the SVG is embedded in.
 *
 * A tested component library (not free-generated code per page) is what makes 60 pages reliable.
 */

const INK = "#14181f", MUTED = "#6b7280", HAIR = "#e6e3dc", PAPER = "#ffffff";
const DISPLAY = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";
const MONO = "'IBM Plex Mono', 'SF Mono', ui-monospace, monospace";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
// Clip a label to at most n chars on a word boundary (no ellipsis) — keeps node/hub labels short so they
// never overflow their shape, even when the LLM hands us a whole sentence.
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); if (t.length <= n) return t; let o = ""; for (const w of t.split(" ")) { if ((o + " " + w).trim().length > n) break; o = (o + " " + w).trim(); } return o || t.slice(0, n); };
function tint(hex, alpha) { const h = hex.replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return `rgba(${r},${g},${b},${alpha})`; }
// crude word-wrap into tspans
function wrapLines(text, max) {
  const words = String(text || "").split(/\s+/); const lines = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function wrap(text, max, x, y, lh, attrs = "") {
  return wrapLines(text, max).map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}" ${attrs}>${esc(ln)}</tspan>`).join("");
}
// vertically-centred multiline text (used inside the diagram core circle)
function centeredText(text, cx, cy, max, fontSize, lh, fill) {
  const lines = wrapLines(text, max);
  const startDy = -((lines.length - 1) * lh) / 2;
  const tspans = lines.map((ln, i) => `<tspan x="${cx}" dy="${i === 0 ? startDy : lh}">${esc(ln)}</tspan>`).join("");
  return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="${SANS}" font-size="${fontSize}" font-weight="800" fill="${fill}">${tspans}</text>`;
}
const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;

/* ---------- CHART (bar or line) ---------- */
export function chart(spec, accent) {
  const data = (spec.data || []).map((d) => ({ label: String(d.label ?? ""), value: num(d.value) })).slice(0, 8);
  if (data.length < 2) return null;
  const W = 1000, H = 620, padL = 90, padR = 40, padT = 90, padB = 90;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 1), min = Math.min(0, ...data.map((d) => d.value));
  const yFor = (v) => padT + plotH - ((v - min) / (max - min || 1)) * plotH;
  const isLine = (spec.type || "bar") === "line";
  let body = `<text x="${padL}" y="52" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  // gridlines + y labels
  for (let i = 0; i <= 4; i++) { const v = min + ((max - min) * i) / 4; const y = yFor(v); body += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${HAIR}" stroke-width="1"/><text x="${padL - 14}" y="${y + 5}" text-anchor="end" font-family="${MONO}" font-size="20" fill="${MUTED}">${Math.round(v).toLocaleString()}</text>`; }
  const slot = plotW / data.length;
  if (isLine) {
    const pts = data.map((d, i) => `${padL + slot * (i + 0.5)},${yFor(d.value)}`).join(" ");
    body += `<polyline points="${pts}" fill="none" stroke="${accent}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
    body += data.map((d, i) => `<circle cx="${padL + slot * (i + 0.5)}" cy="${yFor(d.value)}" r="6" fill="${accent}"/>`).join("");
  } else {
    const bw = Math.min(slot * 0.55, 90);
    body += data.map((d, i) => { const x = padL + slot * (i + 0.5) - bw / 2; const y = yFor(d.value); const h = padT + plotH - y; return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${accent}"/><text x="${x + bw / 2}" y="${y - 12}" text-anchor="middle" font-family="${MONO}" font-size="22" font-weight="700" fill="${INK}">${d.value.toLocaleString()}</text>`; }).join("");
  }
  body += data.map((d, i) => `<text x="${padL + slot * (i + 0.5)}" y="${H - padB + 34}" text-anchor="middle" font-family="${SANS}" font-size="20" fill="${MUTED}">${wrap(d.label, 14, padL + slot * (i + 0.5), 0, 22)}</text>`).join("");
  if (spec.source) body += `<text x="${padL}" y="${H - 20}" font-family="${SANS}" font-size="17" fill="${MUTED}">Source: ${esc(spec.source)}</text>`;
  return svg(W, H, body);
}

/* ---------- BIG STAT ---------- */
export function bigstat(spec, accent) {
  const W = 1000, H = 520;
  let body = `<text x="${W / 2}" y="300" text-anchor="middle" font-family="${DISPLAY}" font-size="200" font-weight="800" fill="${accent}">${esc(spec.value || "")}</text>`;
  body += `<text x="${W / 2}" y="380" text-anchor="middle" font-family="${SANS}" font-size="38" font-weight="700" fill="${INK}">${esc(spec.label || "")}</text>`;
  if (spec.sub) body += `<text x="${W / 2}" y="440" text-anchor="middle" font-family="${SANS}" font-size="24" fill="${MUTED}">${wrap(spec.sub, 60, W / 2, 0, 30)}</text>`;
  return svg(W, H, body);
}

/* ---------- STAT GRID ---------- */
export function statgrid(spec, accent) {
  const stats = (spec.stats || []).slice(0, 4); if (stats.length < 2) return null;
  const W = 1000, cols = stats.length <= 2 ? stats.length : 2, rows = Math.ceil(stats.length / cols);
  const cw = W / cols, ch = 260, H = rows * ch + 90;
  let body = `<text x="0" y="52" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  stats.forEach((s, i) => { const cx = (i % cols) * cw + cw / 2; const cy = 90 + Math.floor(i / cols) * ch + ch / 2; body += `<text x="${cx}" y="${cy - 10}" text-anchor="middle" font-family="${DISPLAY}" font-size="96" font-weight="800" fill="${accent}">${esc(s.value)}</text><text x="${cx}" y="${cy + 50}" text-anchor="middle" font-family="${SANS}" font-size="24" fill="${MUTED}">${wrap(s.label, 26, cx, 0, 30)}</text>`; });
  return svg(W, H, body);
}

/* ---------- TIMELINE ---------- */
export function timeline(spec, accent) {
  const ev = (spec.events || []).slice(0, 6); if (ev.length < 2) return null;
  const W = 1000, rowH = 130, H = ev.length * rowH + 100, x = 150;
  let body = `<text x="0" y="52" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  body += `<line x1="${x}" y1="110" x2="${x}" y2="${H - 40}" stroke="${HAIR}" stroke-width="3"/>`;
  ev.forEach((e, i) => { const cy = 130 + i * rowH; body += `<circle cx="${x}" cy="${cy}" r="12" fill="${accent}"/><text x="${x - 30}" y="${cy + 7}" text-anchor="end" font-family="${MONO}" font-size="26" font-weight="700" fill="${accent}">${esc(e.when)}</text><text x="${x + 34}" y="${cy + 7}" font-family="${SANS}" font-size="26" fill="${INK}">${wrap(e.what, 52, x + 34, 0, 32)}</text>`; });
  return svg(W, H, body);
}

/* ---------- MATRIX (2x2) ---------- */
export function matrix(spec, accent) {
  const q = (spec.quadrants || []).slice(0, 4); if (q.length < 4) return null;
  const W = 1000, size = 600, x0 = 200, y0 = 100, H = y0 + size + 70;
  let body = `<text x="0" y="52" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  const cell = size / 2, gap = 16;
  // cards (the gap between them forms the 2x2 grid), content vertically centred in each card
  q.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cxCell = x0 + col * cell, cyCell = y0 + row * cell;
    const cw = cell - gap, chh = cell - gap, tx = cxCell + 30;
    body += `<rect x="${cxCell + gap / 2}" y="${cyCell + gap / 2}" width="${cw}" height="${chh}" rx="14" fill="${tint(accent, 0.05)}"/>`;
    const labelLines = wrapLines(it.label, 22).length;
    const noteLines = it.note ? wrapLines(it.note, 28).length : 0;
    const totalH = labelLines * 34 + (noteLines ? 12 + noteLines * 26 : 0);
    const startY = cyCell + chh / 2 - totalH / 2 + 26;
    body += `<text x="${tx}" y="${startY}" font-family="${SANS}" font-size="26" font-weight="800" fill="${accent}">${wrap(it.label, 22, tx, 0, 32)}</text>`;
    if (it.note) body += `<text x="${tx}" y="${startY + labelLines * 34 + 8}" font-family="${SANS}" font-size="20" fill="${MUTED}">${wrap(it.note, 28, tx, 0, 26)}</text>`;
  });
  if (spec.xLabel) body += `<text x="${x0 + size / 2}" y="${y0 + size + 44}" text-anchor="middle" font-family="${MONO}" font-size="21" fill="${MUTED}">${esc(spec.xLabel)} →</text>`;
  if (spec.yLabel) body += `<text x="${x0 - 32}" y="${y0 + size / 2}" text-anchor="middle" font-family="${MONO}" font-size="21" fill="${MUTED}" transform="rotate(-90 ${x0 - 32} ${y0 + size / 2})">${esc(spec.yLabel)} →</text>`;
  return svg(W, H, body);
}

/* ---------- FLOW (vertical steps) ---------- */
export function flow(spec, accent) {
  const steps = (spec.steps || []).map(String).slice(0, 6); if (steps.length < 2) return null;
  const W = 1000, rowH = 150, H = steps.length * rowH + 90;
  let body = `<text x="0" y="52" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  steps.forEach((s, i) => { const y = 100 + i * rowH; body += `<rect x="0" y="${y}" width="80" height="80" rx="16" fill="${tint(accent, 0.12)}" stroke="${accent}" stroke-width="2"/><text x="40" y="${y + 54}" text-anchor="middle" font-family="${MONO}" font-size="40" font-weight="800" fill="${accent}">${i + 1}</text><text x="120" y="${y + 50}" font-family="${SANS}" font-size="27" fill="${INK}">${wrap(s, 60, 120, 0, 34)}</text>`; if (i < steps.length - 1) body += `<line x1="40" y1="${y + 80}" x2="40" y2="${y + rowH}" stroke="${accent}" stroke-width="2" stroke-dasharray="4 6"/>`; });
  return svg(W, H, body);
}

/* Reject the generic placeholder labels that make a diagram look machine-generated ("Key idea", a bare
   "Note:", a colon-terminated fragment, or a single throwaway word). Returning too few good parts makes
   diagram() bail to a cleaner fallback figure. */
const GENERIC_LABEL = /^(key idea|idea|core|concept|note|point|overview|summary|topic|main point|n\/a|tbd|item|thing)$|:\s*$/i;
function cleanParts(parts) {
  return (parts || []).map((p) => String(p || "").replace(/^note\s*:\s*/i, "").replace(/:\s*$/, "").trim())
    .filter((p) => p && p.length >= 3 && !GENERIC_LABEL.test(p) && p.split(/\s+/).length <= 6)
    .filter((p, i, a) => a.findIndex((x) => x.toLowerCase() === p.toLowerCase()) === i);
}

/* ---------- DIAGRAM (core + parts, radial) ---------- */
export function diagram(spec, accent) {
  const parts = cleanParts(spec.parts).map((p) => clip(p, 30)).slice(0, 6);
  const core = clip(spec.core, 24);
  if (!core || GENERIC_LABEL.test(core) || parts.length < 3) return null; // too weak -> caller uses a fallback
  const W = 1000, H = 760, cx = W / 2, cy = H / 2 + 20, R = 262, CR = 120;
  let body = `<text x="${cx}" y="52" text-anchor="middle" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  const nodes = parts.map((p, i) => { const a = (-90 + (360 / parts.length) * i) * Math.PI / 180; return { p, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; });
  body += nodes.map((n) => `<line x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}" stroke="${HAIR}" stroke-width="2"/>`).join("");
  nodes.forEach((n) => { body += `<rect x="${n.x - 112}" y="${n.y - 42}" width="224" height="84" rx="12" fill="${PAPER}" stroke="${accent}" stroke-width="2"/><text x="${n.x}" y="${n.y + 6}" text-anchor="middle" font-family="${SANS}" font-size="21" fill="${INK}">${wrap(n.p, 22, n.x, 0, 25)}</text>`; });
  body += `<circle cx="${cx}" cy="${cy}" r="${CR}" fill="${accent}"/>` + centeredText(core, cx, cy, 11, core.length > 15 ? 21 : 25, 27, "#fff");
  return svg(W, H, body);
}

/* ---------- CONCEPT MAP (hub + spokes + labels) ---------- */
export function conceptmap(spec, accent) {
  const nodes = (spec.nodes || []).map(String).slice(0, 7); if (nodes.length < 3) return null;
  return diagram({ title: spec.title, core: spec.center || "Core", parts: nodes }, accent);
}

/* ---------- COMPARE (two columns) ---------- */
export function compare(spec, accent) {
  const L = spec.left || {}, Rr = spec.right || {};
  const li = (L.items || []).slice(0, 5), ri = (Rr.items || []).slice(0, 5);
  if (!li.length || !ri.length) return null;
  const W = 1000, colW = (W - 60) / 2, H = 130 + Math.max(li.length, ri.length) * 70 + 40;
  let body = `<text x="0" y="52" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  const col = (x, title, items, col2) => { let b = `<rect x="${x}" y="90" width="${colW}" height="${H - 120}" rx="14" fill="${col2 ? tint(accent, 0.06) : "#f7f5f0"}" stroke="${HAIR}"/><text x="${x + 30}" y="140" font-family="${SANS}" font-size="26" font-weight="800" fill="${col2 ? accent : INK}">${esc(title)}</text>`; items.forEach((it, i) => { const y = 190 + i * 70; b += `<text x="${x + 30}" y="${y}" font-family="${SANS}" font-size="22" fill="${INK}">${wrap("• " + it, 34, x + 30, 0, 26)}</text>`; }); return b; };
  body += col(0, L.title || "Before", li, false) + col(colW + 60, Rr.title || "After", ri, true);
  return svg(W, H, body);
}

/* ---------- TABLE ---------- */
export function table(spec, accent) {
  const headers = (spec.headers || []).slice(0, 3), rows = (spec.rows || []).filter((r) => Array.isArray(r)).slice(0, 8);
  if (headers.length < 2 || rows.length < 2) return null;
  const W = 1000, cols = headers.length, cw = W / cols, rowH = 74, H = 90 + (rows.length + 1) * rowH;
  let body = `<text x="0" y="52" font-family="${DISPLAY}" font-size="40" font-weight="700" fill="${INK}">${esc(spec.title || "")}</text>`;
  body += `<rect x="0" y="90" width="${W}" height="${rowH}" fill="${tint(accent, 0.1)}"/>`;
  headers.forEach((h, i) => body += `<text x="${i * cw + 24}" y="${90 + 48}" font-family="${MONO}" font-size="22" font-weight="700" fill="${INK}">${esc(h)}</text>`);
  rows.forEach((r, ri) => { const y = 90 + (ri + 1) * rowH; if (ri % 2) body += `<rect x="0" y="${y}" width="${W}" height="${rowH}" fill="#faf8f4"/>`; r.slice(0, cols).forEach((c, ci) => body += `<text x="${ci * cw + 24}" y="${y + 46}" font-family="${SANS}" font-size="22" fill="${ci === 0 ? INK : MUTED}" font-weight="${ci === 0 ? 600 : 400}">${wrap(c, Math.floor(cw / 12), ci * cw + 24, 0, 26)}</text>`); });
  body += `<line x1="0" y1="90" x2="0" y2="${H}" stroke="${HAIR}"/>`;
  return svg(W, H, body);
}

/* ---------- QUOTE ---------- */
export function quote(spec, accent) {
  const W = 1000, H = 440;
  let body = `<text x="60" y="150" font-family="${DISPLAY}" font-size="180" fill="${tint(accent, 0.25)}">“</text>`;
  body += `<text x="90" y="220" font-family="${DISPLAY}" font-size="46" font-style="italic" fill="${INK}">${wrap(spec.text || "", 40, 90, 0, 60)}</text>`;
  body += `<text x="90" y="${H - 50}" font-family="${MONO}" font-size="24" font-weight="700" fill="${accent}">— ${esc(spec.author || "")}${spec.role ? `, ${esc(spec.role)}` : ""}</text>`;
  return svg(W, H, body);
}

export const PRIMITIVES = { chart, bigstat, statgrid, timeline, matrix, flow, diagram, conceptmap, compare, table, quote };
