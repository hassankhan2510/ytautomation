// SPACE SOLVE: one scene's elements -> boxes on a canvas, for any aspect ratio. A box-glue stack: the
// biggest type scale where every line fits the safe area, nothing overlaps, hierarchy holds (title >> body)
// and nothing goes under the platform UI. If even the smallest readable scale cannot fit, it says so
// (diagnostic) instead of overflowing silently.
// Text width is ESTIMATED from per-glyph-class advance widths (no font shaper yet — honest v0 limit).

export const CANVAS = {
  "9:16": { w: 1080, h: 1920, safe: { x0: 90, x1: 990, y0: 250, y1: 1480 } },   // bottom = captions + app UI
  "1:1": { w: 1080, h: 1080, safe: { x0: 80, x1: 1000, y0: 90, y1: 860 } },
  "16:9": { w: 1920, h: 1080, safe: { x0: 150, x1: 1770, y0: 90, y1: 850 } },
  "4:5": { w: 1080, h: 1350, safe: { x0: 80, x1: 1000, y0: 110, y1: 1110 } },
};

// size = fraction of the reference length; lh = line height; w = average advance in em
export const ROLE_SPEC = {
  kicker: { size: 0.05, lh: 1.1, maxLines: 1, w: 0.66, upper: true, weight: 800, floor: 26 },
  title: { size: 0.14, lh: 1.0, maxLines: 3, w: 0.56, weight: 900, floor: 54 },
  body: { size: 0.062, lh: 1.22, maxLines: 4, w: 0.5, weight: 600, floor: 34 },
  stat: { size: 0.3, lh: 0.95, maxLines: 1, w: 0.62, weight: 900, floor: 110 },
  label: { size: 0.058, lh: 1.15, maxLines: 2, w: 0.5, weight: 700, floor: 32 },
  item: { size: 0.078, lh: 1.12, maxLines: 2, w: 0.53, weight: 800, floor: 38 },
  quote: { size: 0.085, lh: 1.15, maxLines: 4, w: 0.5, weight: 700, floor: 40 },
  by: { size: 0.045, lh: 1.2, maxLines: 1, w: 0.5, weight: 600, floor: 26 },
};

const glyphW = (ch) => (/[il.,'’:;!|]/.test(ch) ? 0.55 : /[mwMW@%]/.test(ch) ? 1.45 : /[A-Z0-9]/.test(ch) ? 1.18 : ch === " " ? 0.55 : 1);
export const textWidth = (s, fs, spec) => [...(spec.upper ? s.toUpperCase() : s)].reduce((a, c) => a + glyphW(c), 0) * spec.w * fs * (spec.upper ? 1.08 : 1);

export function wrap(text, fs, spec, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (textWidth(w, fs, spec) > maxW) return null;               // one word wider than the box
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, fs, spec) <= maxW) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length <= spec.maxLines ? lines : null;
}

// element -> list of typographic blocks (a stat is number + label, a list is N items…)
function blocksOf(el) {
  switch (el.role) {
    case "stat": return [{ kind: "stat", text: el.text }, ...(el.label ? [{ kind: "label", text: el.label }] : [])];
    case "list": return el.items.map((t, i) => ({ kind: "item", text: t, item: i }));
    case "quote": return [{ kind: "quote", text: `“${el.text}”` }, ...(el.by ? [{ kind: "by", text: `— ${el.by}` }] : [])];
    case "caption": return [];                                      // captions live in the caption band
    default: return [{ kind: el.role, text: el.text }];
  }
}

export function solveLayout(elements, aspect = "9:16") {
  const C = CANVAS[aspect];
  if (!C) throw new Error(`unknown aspect ${aspect}`);
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
        const spec = ROLE_SPEC[b.kind];
        const fs = Math.round(spec.size * ref * s);
        const lines = wrap(b.text, fs, spec, W);
        if (!lines) return null;
        const h = lines.length * fs * spec.lh;
        gb.push({ ...b, fs, lines, h, w: Math.max(...lines.map((l) => textWidth(l, fs, spec))) });
      }
      const inner = gb.reduce((a, b) => a + b.h, 0) + (gb.length - 1) * gb[0].fs * 0.12;
      placed.push({ g, gb, h: inner });
      total += inner;
    }
    const gaps = placed.slice(1).map((p, n) => 0.42 * Math.max(p.gb[0].fs, placed[n].gb[placed[n].gb.length - 1].fs));
    total += gaps.reduce((a, b) => a + b, 0);
    return total <= H ? { placed, gaps, total } : null;
  };

  let lo = 0.3, hi = 1.0, best = attempt(hi) ? hi : null;
  if (best == null) {
    for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (attempt(mid)) lo = mid; else hi = mid; }
    best = attempt(lo) ? lo : null;
  }
  if (best == null) return { aspect, scale: 0, boxes: [], diagnostics: ["does not fit even at 30% type size — too much text for one scene; split it"] };
  const sol = attempt(best);
  // optical centre: a little above the middle of the safe area
  let y = y0 + Math.max(0, (H - sol.total) * 0.42);
  const boxes = [];
  sol.placed.forEach((p, n) => {
    if (n) y += sol.gaps[n - 1];
    for (const b of p.gb) {
      const spec = ROLE_SPEC[b.kind];
      if (b.fs < spec.floor) diagnostics.push(`${b.kind} "${b.text.slice(0, 24)}" is ${b.fs}px, below the readable ${spec.floor}px — shorten it`);
      boxes.push({ el: p.g.i, kind: b.kind, item: b.item, text: b.text, lines: b.lines, fontSize: b.fs, lineHeight: spec.lh, weight: spec.weight, upper: !!spec.upper,
        x: Math.round(x0 + (W - b.w) / 2), y: Math.round(y), w: Math.round(b.w), h: Math.round(b.h) });
      y += b.h + b.fs * 0.12;
    }
    y -= p.gb[p.gb.length - 1].fs * 0.12;
  });
  return { aspect, scale: Math.round(best * 1000) / 1000, boxes, diagnostics };
}
