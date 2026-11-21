// MOTION v1 — the animation compiler. Every animated unit (a word of a title, a stat, a list item…) is a
// damped spring whose parameters are SOLVED, not picked:
//   1. feel (soft / snappy / heavy / elastic) from role × mood × how loud the voice is on that word
//   2. JOINT DEADLINE + ATTENTION SOLVE (one sweep, O(n log n)): every unit settles before the scene exits,
//      and big moves never overlap in their salient phase ("one focus at a time") — durations shrink inside
//      the feel's range; if impossible a unit may start up to 0.25 s early; else it is demoted to a small move
//   3. KINETIC SYNC: title words the voice actually says appear exactly as they are said
//   4. voice loudness -> amplitude (louder word, bigger hit) and the size of the emphasis pulse
//   5. animation principles as a filter on the sampled curves (Cartoon Animation Filter, Wang et al. 2006):
//      x' = x − A·σ²·(G_σ * x)''  → wind-up before a hit, overshoot and follow-through after it
// Output: per-frame tracks the renderer only plays back (also exportable as keyframes).

export const FPS = 30;
const r2 = (x) => Math.round(x * 100) / 100;
const norm = (s) => String(s).toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

export const FEELS = {
  soft: { zeta: 1.0, dPref: 0.55, dMin: 0.3, dMax: 0.8, travel: 42, scaleFrom: 1.0, blur: 10, filter: 0 },
  snappy: { zeta: 0.74, dPref: 0.42, dMin: 0.22, dMax: 0.6, travel: 62, scaleFrom: 0.92, blur: 14, filter: 0.8 },
  heavy: { zeta: 0.52, dPref: 0.5, dMin: 0.28, dMax: 0.7, travel: 0, scaleFrom: 1.55, blur: 18, filter: 1.2 },
  elastic: { zeta: 0.42, dPref: 0.6, dMin: 0.32, dMax: 0.8, travel: 88, scaleFrom: 0.72, blur: 12, filter: 1.5 },
};
const LADDER = ["soft", "snappy", "heavy"];
const MOOD_FEEL = { calm: "soft", warm: "soft", serious: "snappy", tense: "snappy", hype: "elastic" };
const EXIT = { calm: 0.24, warm: 0.24, serious: 0.2, tense: 0, hype: 0.18 };
const BIG = new Set(["title", "stat", "item", "quote"]);
const SALIENT = 0.55;                 // fraction of a move during which it owns the viewer's eye
const PREROLL = 0.25;

/** natural frequency so a spring with damping ratio ζ settles (2%) in d seconds */
export function omegaFor(zeta, d) {
  if (zeta >= 1) return 5.834 / d;                                   // critically damped: (1+ωd)e^{-ωd}=0.02
  return -Math.log(0.02 * Math.sqrt(1 - zeta * zeta)) / (zeta * d);
}
/** step response 0 -> 1 (with overshoot when ζ < 1) */
export function spring(t, zeta, w) {
  if (t <= 0) return 0;
  if (zeta >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}

/** Cartoon Animation Filter on a sampled curve (edge-extended): x − A·σ²·(G_σ*x)'' */
export function cartoon(xs, A, sigmaFrames = 1.5) {
  if (!A || xs.length < 3) return xs;
  const R = Math.ceil(sigmaFrames * 3), k = [];
  let sum = 0;
  for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * sigmaFrames * sigmaFrames)); k.push(v); sum += v; }
  const at = (i) => xs[Math.max(0, Math.min(xs.length - 1, i))];
  const g = xs.map((_, i) => k.reduce((a, kv, j) => a + kv * at(i + j - R), 0) / sum);
  const gat = (i) => g[Math.max(0, Math.min(g.length - 1, i))];
  return xs.map((x, i) => x - A * sigmaFrames * sigmaFrames * (gat(i + 1) - 2 * gat(i) + gat(i - 1)));
}

function feelFor(kind, mood, z) {
  let f = kind === "stat" ? "heavy" : kind === "item" ? "snappy" : kind === "kicker" || kind === "label" || kind === "by" ? "soft" : MOOD_FEEL[mood] || "soft";
  if (f !== "elastic" && z != null) {
    const i = LADDER.indexOf(f);
    if (z > 1.0 && i < LADDER.length - 1) f = LADDER[i + 1];
    else if (z < -0.9 && i > 0) f = LADDER[i - 1];
  }
  return f;
}
const ampFor = (z) => (z == null ? 1 : Math.max(0.75, Math.min(1.4, 1 + 0.18 * z)));

/** Build the enter track of one unit (sampled from its start frame until it has settled). */
function enterTrack(feel, d, amp, extraFilter = 1) {
  const F = FEELS[feel], w = omegaFor(F.zeta, d);
  const n = Math.max(2, Math.ceil(d * FPS) + 1);
  const p = Array.from({ length: n }, (_, i) => spring(i / FPS, F.zeta, w));
  const ty = cartoon(p.map((v) => F.travel * amp * (1 - v)), F.filter * extraFilter);
  const sFrom = 1 + (F.scaleFrom - 1) * amp;
  const sc = cartoon(p.map((v) => sFrom + (1 - sFrom) * v), F.filter * extraFilter);
  const op = p.map((_, i) => { const u = Math.min(1, i / FPS / Math.max(0.08, 0.32 * d)); return u * u * (3 - 2 * u); });
  const bl = p.map((v) => Math.max(0, F.blur * (1 - Math.min(1, v * 1.25))));
  return { ty: ty.map(r2), sc: sc.map((v) => Math.round(v * 1000) / 1000), op: op.map((v) => Math.round(v * 1000) / 1000), bl: bl.map(r2) };
}

function pulseTrack(amp) {
  const d = 0.36, zeta = 0.35, w = omegaFor(zeta, d), n = Math.ceil((d + 0.1) * FPS);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  let peak = 0;
  const raw = Array.from({ length: n }, (_, i) => { const t = i / FPS; const v = Math.exp(-zeta * w * t) * Math.sin(wd * t); peak = Math.max(peak, v); return v; });
  const xs = cartoon([0, 0, 0, 0, ...raw.map((v) => v / peak)], 1.2).slice(0);     // wind-up before the hit
  return { lead: 4, sc: xs.map((v) => Math.round((1 + 0.12 * amp * v) * 1000) / 1000) };
}

function exitTrack(mood) {
  const d = EXIT[mood] ?? 0.22;
  if (!d) return { dur: 0, op: [], ty: [], bl: [] };
  const n = Math.max(2, Math.round(d * FPS));
  const e = Array.from({ length: n }, (_, i) => { const u = (i + 1) / n; return u * u * u; });     // ease-in
  return { dur: d, op: e.map((v) => r2(1 - v)), ty: e.map((v) => r2(-22 * v)), bl: e.map((v) => r2(6 * v)) };
}

export function compileMotion(scene, boxes, opts = {}) {
  const seedLoud = opts.loudAt || (() => null);
  const exitDur = EXIT[scene.mood] ?? 0.22;
  const exitT = scene.end - exitDur;
  const stats = { units: 0, shortened: 0, early: 0, demoted: 0, synced: 0, revealed: 0 };

  // 1. units (a title/quote/body is animated word by word; the rest as blocks)
  const groups = [];
  boxes.forEach((b, bi) => {
    const el = scene.elements.find((e) => e.order === b.el) || {};
    let t0 = el.t ?? scene.start;
    if (b.kind === "item" && el.itemTimes) t0 = el.itemTimes[b.item];
    if (b.kind === "label" || b.kind === "by") t0 += 0.15;
    const perWord = ["title", "quote", "body"].includes(b.kind);
    const words = [];
    b.lines.forEach((ln, li) => ln.words.forEach((w, wi) => words.push({ li, wi, w })));
    groups.push({ b, bi, el, kind: b.kind, t0, perWord, words, big: BIG.has(b.kind) });
  });
  groups.sort((a, c) => a.t0 - c.t0 || a.bi - c.bi);

  // 2. kinetic sync: words of a title the voice says, appear as they are said
  for (const g of groups) {
    if (!g.perWord || !scene.words?.length) continue;
    const times = [];
    let j = scene.words.findIndex((w) => w.start >= g.t0 - 0.4);
    if (j < 0) j = scene.words.length;
    let hits = 0;
    for (const u of g.words) {
      const key = norm(u.w.text);
      let k = j;
      while (k < scene.words.length && norm(scene.words[k].w) !== key && k < j + 4) k++;
      if (k < scene.words.length && norm(scene.words[k].w) === key) { times.push(scene.words[k].start - 0.05); j = k + 1; hits++; }
      else times.push(null);
    }
    if (g.words.length >= 2 && hits / g.words.length >= 0.7) {
      // fill gaps by interpolation; never earlier than the group's own (reading-safe) start
      let last = g.t0;
      g.wordTimes = times.map((t, i) => { if (t == null) { const nx = times.slice(i + 1).find((x) => x != null) ?? last + 0.12; t = (last + nx) / 2; } last = Math.max(g.t0, t); return last; });
      g.synced = true; stats.synced++;
    }
  }

  // 2b. NO DEAD SCREEN. (a) a synced title whose words come late (or would be up too briefly to read) is
  //     REVEALED: all words enter at the start of the scene, dimmed, and each lights up as it is spoken
  //     (karaoke) — the eye has the whole idea at once, the voice drives the emphasis.
  //     (b) supporting lines (label / kicker / by) whose hero lands late appear first, as the setup.
  const READ_MIN = 0.9;
  for (const g of groups) {
    if (g.synced) {
      const late = g.wordTimes[0] - scene.start > 0.6;
      const brief = g.wordTimes.some((t) => exitT - t < READ_MIN);
      if (late || brief) {
        g.revealLit = g.wordTimes.map((t) => t + 0.03);
        g.synced = false; g.revealed = true;
        g.t0 = Math.min(g.t0, scene.start + 0.12);
        stats.revealed = (stats.revealed || 0) + 1;
      }
    }
  }
  const heroLate = groups.some((g) => (g.kind === "stat" || g.kind === "title") && g.t0 - scene.start > 0.8);
  if (heroLate) for (const g of groups) if (["label", "kicker", "by"].includes(g.kind)) g.t0 = Math.min(g.t0, scene.start + 0.12);
  //     (c) still nothing early? every late block is pre-revealed dimmed and LIGHTS UP on its word
  //         (a stat shows a dim 0 and counts up as the number is spoken)
  if (groups.length && Math.min(...groups.map((g) => g.t0)) - scene.start > 0.5) {
    let n = 0;
    for (const g of groups) if (!g.perWord && g.t0 - scene.start > 0.5) {
      g.blockLit = g.t0; g.t0 = scene.start + 0.12 + 0.08 * n++; g.revealed = true;
      stats.revealed = (stats.revealed || 0) + 1;
    }
  }
  for (const g of groups) if (g.revealed) g.big = false;          // revealed = soft entrance; the light-up is the hit
  groups.sort((a, c) => a.t0 - c.t0 || a.bi - c.bi);

  // 3. joint deadline + attention sweep
  let prevSalientEnd = -Infinity;
  groups.forEach((g, gi) => {
    const z = seedLoud(g.t0);
    g.feel = feelFor(g.kind, scene.mood, z);
    g.amp = ampFor(z);
    const F = FEELS[g.feel];
    const nextBig = groups.slice(gi + 1).find((x) => x.big && x.t0 > g.t0 + 1e-6);
    const span = g.perWord && !g.synced ? (g.words.length - 1) : 0;
    let stagger = span ? 0.06 : 0;
    const budgetTo = (lim) => (lim - g.t0 - stagger * span);
    let upper = Math.min(F.dMax, budgetTo(exitT));
    if (g.big && nextBig) {
      const room = nextBig.t0 - g.t0;
      if (span) stagger = Math.max(0.02, Math.min(stagger, (room - SALIENT * F.dMin) / span));
      upper = Math.min(upper, (nextBig.t0 - g.t0 - stagger * span) / SALIENT);
    }
    if (g.synced) upper = Math.min(F.dMax, exitT - g.wordTimes[g.wordTimes.length - 1]);
    let d = Math.min(F.dPref, upper);
    if (d < F.dPref - 1e-6) stats.shortened++;
    if (d < F.dMin) {
      const shift = Math.min(PREROLL, F.dMin - d, g.t0 - Math.max(scene.start, g.big ? prevSalientEnd : -Infinity));
      if (shift > 0.01 && !g.synced) { g.t0 -= shift; d = Math.min(F.dMin, d + shift); stats.early++; }
      if (d < F.dMin) { g.amp *= 0.5; d = Math.max(0.16, d); g.demoted = true; stats.demoted++; }
    }
    g.d = d; g.stagger = stagger;
    if (g.big) prevSalientEnd = g.t0 + stagger * span + SALIENT * d;
  });

  // 4. tracks
  const ex = exitTrack(scene.mood);
  const units = [];
  for (const g of groups) {
    const b = g.b;
    const unitBase = { box: g.bi, kind: g.kind, feel: g.feel, fontSize: b.fontSize, font: b.font, color: b.color, lineHeight: b.lineHeight };
    const make = (t, extra) => {
      const enter = enterTrack(g.feel, g.d, g.amp);
      return { ...unitBase, ...extra, f0: Math.round(t * FPS), enter, exit: { f0: Math.round(exitT * FPS), ...ex } };
    };
    if (g.perWord) {
      const emph = norm(g.el.emphasis || "");
      g.words.forEach((u, k) => {
        const ln = b.lines[u.li];
        const t = g.synced ? g.wordTimes[k] : g.t0 + g.stagger * k;
        const unit = make(t, { text: u.w.text, x: r2(b.x + ln.x + u.w.x), y: r2(b.y + ln.y), w: u.w.w, line: { x: r2(b.x + ln.x), y: r2(b.y + ln.y), w: ln.w, h: r2(b.fontSize * b.lineHeight) },
          mask: g.kind === "title" && scene.mood !== "hype" });
        if (g.revealLit) {
          unit.dim = 0.32;
          unit.lit = { f0: Math.round(g.revealLit[k] * FPS), pop: [1.07, 1.05, 1.03, 1.015, 1.005, 1] };
        }
        if (emph && norm(u.w.text) === emph) {
          unit.accent = true;
          if (g.el.pulse != null) { const p = pulseTrack(g.amp); unit.pulse = { f0: Math.round(g.el.pulse * FPS) - p.lead, sc: p.sc }; }
        }
        units.push(unit);
      });
    } else {
      const unit = make(g.t0, { text: b.text, x: b.x, y: b.y, w: b.w, chip: b.chip, lines: b.lines.map((l) => ({ text: l.text, x: l.x, y: l.y })) });
      if (g.blockLit != null) { unit.dim = 0.32; unit.lit = { f0: Math.round(g.blockLit * FPS), pop: [1.12, 1.08, 1.04, 1.02, 1.005, 1] }; }
      const m = g.kind === "stat" && /^([^\d]*)([\d][\d.,]*)(.*)$/.exec(b.text);
      if (m) {
        const to = parseFloat(m[2].replace(/,/g, "")), dec = (m[2].split(".")[1] || "").length;
        const n = Math.max(2, Math.round(Math.min(0.9, Math.max(0.5, g.d * 1.4)) * FPS));
        unit.count = { f0: unit.lit ? unit.lit.f0 : unit.f0, prefix: m[1], suffix: m[3], decimals: dec, values: Array.from({ length: n }, (_, i) => { const u = (i + 1) / n; return +(to * (1 - Math.pow(1 - u, 3))).toFixed(dec); }) };
      }
      units.push(unit);
    }
  }
  stats.units = units.length;
  return { units, stats, exitT, debug: groups.map((g) => ({ kind: g.kind, t0: g.t0, d: g.d, stagger: g.stagger, big: g.big, feel: g.feel, amp: g.amp, synced: !!g.synced, demoted: !!g.demoted, words: g.words.length })) };
}
