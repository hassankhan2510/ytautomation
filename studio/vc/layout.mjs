// SPACE SOLVE: one scene's elements -> boxes on a canvas, for any aspect ratio.
//  * EXACT text widths from our font engine (same TTF files the renderer draws with)
//  * BALANCED line breaking (minimum-raggedness dynamic programme, Knuth-Plass family): lines of similar
//    length, a lone last word ("widow") is penalised, every line fits the box
//  * box-glue stack: the biggest type scale (binary search) where everything fits the safe area, no
//    overlap, hierarchy held by the style's size ratios; "does not fit" is reported, never overflowed
//  * every WORD gets its exact x/y inside its line -> per-word motion and emphasis without re-measuring
import { getStyle } from "./style.mjs";

export const CANVAS = {
  "9:16": { w: 1080, h: 1920, safe: { x0: 90, x1: 990, y0: 250, y1: 1480 } },   // bottom = captions + app UI
  "1:1": { w: 1080, h: 1080, safe: { x0: 80, x1: 1000, y0: 90, y1: 860 } },
  "16:9": { w: 1920, h: 1080, safe: { x0: 150, x1: 1770, y0: 90, y1: 850 } },
  "4:5": { w: 1080, h: 1350, safe: { x0: 80, x1: 1000, y0: 110, y1: 1110 } },
};

const show = (s, spec) => (spec.upper ? s.toUpperCase() : s);

/** Balanced breaking. Returns lines (arrays of word indices) or null if impossible within maxLines. */
export function breakLines(words, widthOf, spaceW, maxW, maxLines) {
  const n = words.length;
  if (!n) return [];
  const w = words.map(widthOf);
  if (w.some((x) => x > maxW)) return null;
  // cost[i] = best cost of setting words[i..] ; lines counted to respect maxLines
  const INF = 1e18;
  const best = Array.from({ length: maxLines + 1 }, () => new Float64Array(n + 1).fill(INF));
  const next = Array.from({ length: maxLines + 1 }, () => new Int32Array(n + 1).fill(-1));
  for (let L = 0; L <= maxLines; L++) best[L][n] = 0;
  for (let L = 1; L <= maxLines; L++) {
    for (let i = n - 1; i >= 0; i--) {
      let lineW = -spaceW;
      for (let j = i; j < n; j++) {
        lineW += spaceW + w[j];
        if (lineW > maxW) break;
        const rest = best[L - 1][j + 1];
        if (rest >= INF) continue;
        const last = j === n - 1;
        const slack = (maxW - lineW) / maxW;
        let c = last ? 0.25 * slack * slack : slack * slack;   // the last line may be shorter, not a stub
        if (last && j === i && n > 2) c += 0.6;                 // widow: a single word alone on the last line
        if (c + rest < best[L][i]) { best[L][i] = c + rest; next[L][i] = j + 1; }
      }
    }
  }
  if (best[maxLines][0] >= INF) return null;
  // fewer lines is better when the cost is similar (balanced, not stretched)
  let L = maxLines;
  const lines = [];
  for (let i = 0; i < n; ) { const j = next[L][i]; lines.push([...Array(j - i).keys()].map((k) => i + k)); i = j; L--; }
  return lines;
}

function setText(text, fs, spec, maxW) {
  const m = spec.metrics;
  const tr = spec.tracking;
  const words = show(text, spec).split(/\s+/).filter(Boolean);
  const widthOf = (s) => m.measure(s, fs, tr);
  const spaceW = m.measure(" ", fs, tr);
  // balanced breaking for 1..maxLines lines: prefer the FEWEST lines whose result is balanced
  let lines = null;
  for (let L = 1; L <= spec.maxLines && !lines; L++) lines = breakLines(words, widthOf, spaceW, maxW, L);
  if (!lines) return null;
  const out = lines.map((idx) => {
    const str = idx.map((k) => words[k]).join(" ");
    const lw = widthOf(str);
    const wordsPos = [];
    let x = 0;
    idx.forEach((k, n) => {
      if (n) x = widthOf(idx.slice(0, n).map((q) => words[q]).join(" ") + " ");
      wordsPos.push({ text: words[k], x: +x.toFixed(2), w: +widthOf(words[k]).toFixed(2) });
    });
    return { text: str, w: lw, words: wordsPos };
  });
  return out;
}

function blocksOf(el) {
  switch (el.role) {
    case "stat": return [{ kind: "stat", text: el.text }, ...(el.label ? [{ kind: "label", text: el.label }] : [])];
    case "list": return el.items.map((t, i) => ({ kind: "item", text: t, item: i }));
    case "quote": return [{ kind: "quote", text: `“${el.text}”` }, ...(el.by ? [{ kind: "by", text: `— ${el.by}` }] : [])];
    case "caption": return [];
    default: return [{ kind: el.role, text: el.text }];
  }
}

export function solveLayout(elements, aspect = "9:16", styleName = "cohort-zero") {
  const C = CANVAS[aspect];
  if (!C) throw new Error(`unknown aspect ${aspect}`);
  const style = getStyle(styleName);
  const { x0, x1, y0, y1 } = C.safe;
  const W = x1 - x0, H = y1 - y0;
  const ref = Math.min(W, H * 0.8);
  const groups = elements.map((el, i) => ({ el, i, blocks: blocksOf(el) })).filter((g) => g.blocks.length);
  const diagnostics = [];

  const attempt = (s) => {
    const placed = [];
    let total = 0;
    for (const g of groups) {
      const gb = [];
      for (const b of g.blocks) {
        const spec = style.roles[b.kind];
        const fs = Math.round(spec.size * ref * s);
        const chip = b.kind === "item" ? Math.round(fs * 1.25) : 0;          // "01" chip + gap
        const lines = setText(b.text, fs, spec, W - chip);
        if (!lines) return null;
        gb.push({ ...b, spec, fs, chip, lines, h: lines.length * fs * spec.lh, w: Math.max(...lines.map((l) => l.w)) });
      }
      const inner = gb.reduce((a, b) => a + b.h, 0) + (gb.length - 1) * gb[0].fs * 0.14;
      placed.push({ g, gb, h: inner });
      total += inner;
    }
    const gaps = placed.slice(1).map((p, n) => 0.45 * Math.max(p.gb[0].fs, placed[n].gb[placed[n].gb.length - 1].fs));
    total += gaps.reduce((a, b) => a + b, 0);
    return total <= H ? { placed, gaps, total } : null;
  };

  // biggest scale that fits, up to 1.3x when the scene has little to say (big bold type = the reel look)
  let best = attempt(1.3) ? 1.3 : null;
  if (best == null) {
    let lo = 0.3, hi = 1.3;
    for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (attempt(mid)) lo = mid; else hi = mid; }
    best = attempt(lo) ? lo : null;
  }
  if (best == null) return { aspect, scale: 0, boxes: [], diagnostics: ["does not fit even at 30% type size — too much text for one scene; split it"] };
  const sol = attempt(best);
  // a list reads as a list: every item of one element starts at the same left edge (group centred)
  for (const p of sol.placed) {
    const items = p.gb.filter((b) => b.kind === "item");
    if (items.length > 1) { const mw = Math.max(...items.map((b) => b.w)); for (const b of items) b.groupW = mw; }
  }
  let y = y0 + Math.max(0, (H - sol.total) * 0.47);           // optical centre: just above the middle
  const boxes = [];
  sol.placed.forEach((p, n) => {
    if (n) y += sol.gaps[n - 1];
    p.gb.forEach((b, k) => {
      if (k) y += p.gb[k - 1].fs * 0.14;
      const spec = b.spec;
      if (b.fs < spec.floor) diagnostics.push(`${b.kind} "${b.text.slice(0, 24)}" is ${b.fs}px, below the readable ${spec.floor}px — shorten it`);
      const lineH = b.fs * spec.lh;
      const bx = x0 + (W - (b.groupW ?? b.w) - b.chip) / 2 + b.chip;
      boxes.push({
        el: p.g.i, kind: b.kind, item: b.item, text: b.text,
        font: { family: spec.family, weight: spec.weight, file: spec.font, tracking: spec.tracking, upper: !!spec.upper },
        color: spec.color, fontSize: b.fs, lineHeight: spec.lh,
        x: +bx.toFixed(2), y: +y.toFixed(2), w: +b.w.toFixed(2), h: +b.h.toFixed(2),
        ...(b.chip ? { chip: { x: +(bx - b.chip).toFixed(2), size: Math.round(b.fs * 0.95), label: String((b.item ?? 0) + 1).padStart(2, "0") } } : {}),
        lines: b.lines.map((l, li) => ({ text: l.text, x: b.kind === "item" ? 0 : +((b.w - l.w) / 2).toFixed(2), y: +(li * lineH).toFixed(2), w: +l.w.toFixed(2), words: l.words })),
      });
      y += b.h;
    });
  });
  return { aspect, scale: Math.round(best * 1000) / 1000, boxes, diagnostics };
}
