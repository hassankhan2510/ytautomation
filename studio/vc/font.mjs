// OUR FONT ENGINE — reads TrueType/OpenType files directly (no library): cmap (formats 4/12), hmtx advance
// widths, vertical metrics (hhea/OS2: ascender, descender, cap height, x-height) and pair kerning from
// GPOS (PairPos formats 1+2, incl. Extension lookups) or the legacy 'kern' table. Measures a string the
// way the browser lays it out (advances + kerning + CSS letter-spacing), so the compiler knows EXACT
// widths on CPU — a whole reel shapes in well under a millisecond after the first load.
import { readFileSync } from "node:fs";

function tables(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint16(4);
  const t = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    t[tag] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
  }
  return { dv, t };
}

function readCmap(dv, base) {
  const n = dv.getUint16(base + 2);
  let best = null, score = -1;
  for (let i = 0; i < n; i++) {
    const p = dv.getUint16(base + 4 + i * 8), e = dv.getUint16(base + 6 + i * 8), off = dv.getUint32(base + 8 + i * 8);
    const fmt = dv.getUint16(base + off);
    const s = fmt === 12 ? 3 : fmt === 4 && ((p === 3 && e === 1) || p === 0) ? 2 : 0;
    if (s > score) { score = s; best = base + off; }
  }
  if (best == null) throw new Error("font has no usable cmap");
  const map = new Map();
  const fmt = dv.getUint16(best);
  if (fmt === 4) {
    const segX2 = dv.getUint16(best + 6), ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2), delta = dv.getInt16(deltas + s * 2), ro = dv.getUint16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else { g = dv.getUint16(ranges + s * 2 + ro + (c - start) * 2); if (g) g = (g + delta) & 0xffff; }
        if (g) map.set(c, g);
      }
    }
  } else if (fmt === 12) {
    const groups = dv.getUint32(best + 12);
    for (let i = 0; i < groups; i++) {
      const o = best + 16 + i * 12, s = dv.getUint32(o), e = dv.getUint32(o + 4), g0 = dv.getUint32(o + 8);
      for (let c = s; c <= e; c++) map.set(c, g0 + (c - s));
    }
  }
  return map;
}

function coverage(dv, o) {
  const fmt = dv.getUint16(o), out = new Map();
  if (fmt === 1) { const n = dv.getUint16(o + 2); for (let i = 0; i < n; i++) out.set(dv.getUint16(o + 4 + i * 2), i); }
  else { const n = dv.getUint16(o + 2); for (let i = 0; i < n; i++) { const r = o + 4 + i * 6, s = dv.getUint16(r), e = dv.getUint16(r + 2), idx = dv.getUint16(r + 4); for (let g = s; g <= e; g++) out.set(g, idx + g - s); } }
  return out;
}
function classDef(dv, o) {
  const fmt = dv.getUint16(o), out = new Map();
  if (fmt === 1) { const s = dv.getUint16(o + 2), n = dv.getUint16(o + 4); for (let i = 0; i < n; i++) out.set(s + i, dv.getUint16(o + 6 + i * 2)); }
  else { const n = dv.getUint16(o + 2); for (let i = 0; i < n; i++) { const r = o + 4 + i * 6, s = dv.getUint16(r), e = dv.getUint16(r + 2), c = dv.getUint16(r + 4); for (let g = s; g <= e; g++) out.set(g, c); } }
  return out;
}
const vsize = (f) => { let n = 0; for (let b = f; b; b >>= 1) n += b & 1; return n * 2; };
const xadv = (dv, o, f) => (f & 4 ? dv.getInt16(o + ((f & 1) ? 2 : 0) + ((f & 2) ? 2 : 0)) : 0);

function readGposKern(dv, base) {
  const perLookup = [];
  const fl = base + dv.getUint16(base + 6), ll = base + dv.getUint16(base + 8);
  const lookups = new Set();
  const nf = dv.getUint16(fl);
  for (let i = 0; i < nf; i++) {
    const r = fl + 2 + i * 6;
    const tag = String.fromCharCode(dv.getUint8(r), dv.getUint8(r + 1), dv.getUint8(r + 2), dv.getUint8(r + 3));
    if (tag !== "kern") continue;
    const fo = fl + dv.getUint16(r + 4), n = dv.getUint16(fo + 2);
    for (let k = 0; k < n; k++) lookups.add(dv.getUint16(fo + 4 + k * 2));
  }
  for (const li of [...lookups].sort((a, b) => a - b)) {
    const lo = ll + dv.getUint16(ll + 2 + li * 2);
    const type = dv.getUint16(lo), ns = dv.getUint16(lo + 4);
    const subtables = [];
    perLookup.push(subtables);
    for (let s = 0; s < ns; s++) {
      let so = lo + dv.getUint16(lo + 6 + s * 2), st = type;
      if (type === 9) { st = dv.getUint16(so + 2); so = so + dv.getUint32(so + 4); }
      if (st !== 2) continue;
      const fmt = dv.getUint16(so), cov = coverage(dv, so + dv.getUint16(so + 2)), f1 = dv.getUint16(so + 4), f2 = dv.getUint16(so + 6);
      if (fmt === 1) {
        const sets = new Map(), rec = 2 + vsize(f1) + vsize(f2);
        for (const [g, idx] of cov) {
          const ps = so + dv.getUint16(so + 10 + idx * 2), n = dv.getUint16(ps), m = new Map();
          for (let k = 0; k < n; k++) { const r = ps + 2 + k * rec; const v = xadv(dv, r + 2, f1); if (v) m.set(dv.getUint16(r), v); }
          sets.set(g, m);
        }
        subtables.push({ cov, get: (a, b) => sets.get(a)?.get(b) });
      } else if (fmt === 2) {
        const c1 = classDef(dv, so + dv.getUint16(so + 8)), c2 = classDef(dv, so + dv.getUint16(so + 10));
        const n1 = dv.getUint16(so + 12), n2 = dv.getUint16(so + 14), rec = vsize(f1) + vsize(f2);
        const vals = new Int16Array(n1 * n2);
        for (let a = 0; a < n1; a++) for (let b = 0; b < n2; b++) vals[a * n2 + b] = xadv(dv, so + 16 + (a * n2 + b) * rec, f1);
        subtables.push({ cov, get: (a, b) => vals[(c1.get(a) || 0) * n2 + (c2.get(b) || 0)] });
      }
    }
  }
  // OpenType: lookups ADD; inside one lookup the first subtable that applies to the pair decides
  // (format 1 applies only if the pair is listed; format 2 applies whenever the left glyph is covered)
  return (a, b) => {
    let total = 0;
    for (const subs of perLookup) for (const s of subs) {
      if (!s.cov.has(a)) continue;
      const v = s.get(a, b);
      if (v === undefined) continue;
      total += v; break;
    }
    return total;
  };
}

// GSUB 'liga' (LigatureSubst, lookup type 4, incl. Extension type 7): first glyph -> [{comps, lig}],
// longest match first. The browser applies it only when letter-spacing is 0, so do we.
function readLigatures(dv, base) {
  const fl = base + dv.getUint16(base + 6), ll = base + dv.getUint16(base + 8);
  const lookups = new Set();
  const nf = dv.getUint16(fl);
  for (let i = 0; i < nf; i++) {
    const r = fl + 2 + i * 6;
    const tag = String.fromCharCode(dv.getUint8(r), dv.getUint8(r + 1), dv.getUint8(r + 2), dv.getUint8(r + 3));
    if (tag !== "liga") continue;
    const fo = fl + dv.getUint16(r + 4), n = dv.getUint16(fo + 2);
    for (let k = 0; k < n; k++) lookups.add(dv.getUint16(fo + 4 + k * 2));
  }
  const ligs = new Map();
  for (const li of lookups) {
    const lo = ll + dv.getUint16(ll + 2 + li * 2);
    const type = dv.getUint16(lo), ns = dv.getUint16(lo + 4);
    for (let s = 0; s < ns; s++) {
      let so = lo + dv.getUint16(lo + 6 + s * 2), st = type;
      if (type === 7) { st = dv.getUint16(so + 2); so = so + dv.getUint32(so + 4); }
      if (st !== 4) continue;
      const cov = coverage(dv, so + dv.getUint16(so + 2));
      for (const [g, idx] of cov) {
        const ls = so + dv.getUint16(so + 6 + idx * 2), n = dv.getUint16(ls);
        const list = ligs.get(g) || [];
        for (let k = 0; k < n; k++) {
          const lg = ls + dv.getUint16(ls + 2 + k * 2), lig = dv.getUint16(lg), cc = dv.getUint16(lg + 2);
          const comps = [];
          for (let c = 1; c < cc; c++) comps.push(dv.getUint16(lg + 4 + (c - 1) * 2));
          list.push({ comps, lig });
        }
        ligs.set(g, list.sort((a, b) => b.comps.length - a.comps.length));
      }
    }
  }
  return ligs;
}

function readKernTable(dv, base) {
  const m = new Map();
  if (dv.getUint16(base) !== 0) return () => 0;
  const n = dv.getUint16(base + 2);
  let o = base + 4;
  for (let i = 0; i < n; i++) {
    const len = dv.getUint16(o + 2), cov = dv.getUint16(o + 4);
    if ((cov >> 8) === 0) { const np = dv.getUint16(o + 6); for (let k = 0; k < np; k++) { const r = o + 14 + k * 6; m.set(dv.getUint16(r) * 65536 + dv.getUint16(r + 2), dv.getInt16(r + 4)); } }
    o += len;
  }
  return (a, b) => m.get(a * 65536 + b) || 0;
}

const cache = new Map();
export function loadFont(path) {
  if (cache.has(path)) return cache.get(path);
  const buf = readFileSync(path);
  const { dv, t } = tables(buf);
  const upm = dv.getUint16(t.head.off + 18);
  const numHM = dv.getUint16(t.hhea.off + 34);
  const adv = (g) => dv.getUint16(t.hmtx.off + Math.min(g, numHM - 1) * 4);
  const cmap = readCmap(dv, t.cmap.off);
  const kernFn = t.GPOS ? readGposKern(dv, t.GPOS.off) : t.kern ? readKernTable(dv, t.kern.off) : () => 0;
  const os2 = t["OS/2"]?.off;
  const metrics = {
    ascender: dv.getInt16(t.hhea.off + 4) / upm, descender: dv.getInt16(t.hhea.off + 6) / upm,
    capHeight: os2 && dv.getUint16(os2) >= 2 ? dv.getInt16(os2 + 88) / upm : 0.7,
    xHeight: os2 && dv.getUint16(os2) >= 2 ? dv.getInt16(os2 + 86) / upm : 0.5,
  };
  const glyph = (cp) => cmap.get(cp) ?? cmap.get(0xfffd) ?? 0;
  const ligs = t.GSUB ? readLigatures(dv, t.GSUB.off) : new Map();
  // text -> glyph run (ligatures applied when letter-spacing is 0, like the browser)
  const shape = (text, tracking) => {
    const gs = [...text].map((ch) => glyph(ch.codePointAt(0)));
    if (tracking || !ligs.size) return gs;
    const out = [];
    for (let i = 0; i < gs.length; i++) {
      const cand = ligs.get(gs[i]);
      const hit = cand && cand.find((L) => L.comps.every((c, k) => gs[i + 1 + k] === c));
      if (hit) { out.push(hit.lig); i += hit.comps.length; } else out.push(gs[i]);
    }
    return out;
  };
  const pairCache = new Map();
  const kern = (a, b) => { const k = a * 65536 + b; let v = pairCache.get(k); if (v === undefined) { v = kernFn(a, b); pairCache.set(k, v); } return v; };
  const font = {
    path, upm, metrics,
    /** width in px of `text` at `size` px with CSS letter-spacing `tracking` (em) */
    measure(text, size, tracking = 0) {
      let w = 0, prev = -1;
      const gs = shape(text, tracking);
      for (const g of gs) { w += adv(g) + (prev >= 0 ? kern(prev, g) : 0); prev = g; }
      return (w / upm) * size + [...text].length * tracking * size;
    },
    /** x offset (px) where each character starts, for per-letter animation */
    offsets(text, size, tracking = 0) {
      const out = [];
      let w = 0, prev = -1;
      for (const ch of text) {
        const g = glyph(ch.codePointAt(0));
        if (prev >= 0) w += kern(prev, g);
        out.push((w / upm) * size + out.length * tracking * size);
        w += adv(g); prev = g;
      }
      return out;
    },
  };
  cache.set(path, font);
  return font;
}
