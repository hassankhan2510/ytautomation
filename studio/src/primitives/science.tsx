/**
 * SCIENCE + JOURNEYS family — history news, travel/voyages, biology, physics, space, hardware,
 * health, fact-checks, maths and memes. Rich and cinematic, but CPU-cheap:
 * no full-screen blur / mix-blend-mode, modest SVG element counts, unique SVG ids per beat.
 * Every scene looks finished from beat.text alone; colours come from the theme
 * (cards use theme.surface so vivid themes get glass panels, light themes get bright ones).
 */
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, fitSize, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { prop, Safe, type PrimitiveProps } from "./common";

const HAND = loadCaveat("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily;
const src = (p: string) => (/^https?:\/\//.test(p) ? p : staticFile(p));
const serif = "Georgia, 'Times New Roman', serif";
const PAPER = "#F2EEE4";
const PAPER_INK = "#141210";
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/* ─────────────────────────── NEWSPAPER SPIN ───────────────────────────
 * The classic movie newspaper: spins in from nothing and slams flat — masthead, date bar, headline. */
export const NewspaperSpin: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const masthead = prop<string>(beat, "masthead", "THE DAILY CHRONICLE");
  const headline = prop<string>(beat, "headline", beat.text.replace(/[.!?]$/, ""));
  const date = prop<string>(beat, "date", "");
  const file = prop<string>(beat, "src", "");
  const s = pop(frame, fps, 0, "slam");
  const spin = interpolate(s, [0, 1], [900, -4]);
  const size = fitSize(headline.toUpperCase().split(/\s+/), 760, 104, 54, 0.6);
  const bar = (w: number, k: number) => <div key={k} style={{ height: 10, width: `${w}%`, background: alpha(PAPER_INK, 0.18), marginBottom: 12 }} />;
  return (
    <Safe>
      <div style={{ width: 860, padding: "38px 46px 46px", background: PAPER, color: PAPER_INK, transform: `rotate(${spin}deg) scale(${interpolate(s, [0, 1], [0.05, 1])})`, boxShadow: "0 40px 100px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", fontFamily: serif, fontWeight: 700, fontSize: fitSize([masthead], 760, 66, 34, 0.62), letterSpacing: 2, lineHeight: 1 }}>{masthead}</div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `3px solid ${PAPER_INK}`, borderBottom: `1px solid ${PAPER_INK}`, margin: "16px 0 22px", padding: "6px 0", fontFamily: serif, fontSize: 22, letterSpacing: 2 }}>
          <span>{date ? date.toUpperCase() : "LATE EDITION"}</span><span>★ EXTRA ★</span><span>ONE PENNY</span>
        </div>
        <div style={{ fontFamily: serif, fontWeight: 900, fontSize: size, lineHeight: 0.98, textAlign: "center", textTransform: "uppercase" }}>{headline}</div>
        <div style={{ display: "flex", gap: 26, marginTop: 28 }}>
          <div style={{ flex: 1.1, height: 250, background: alpha(PAPER_INK, 0.12), overflow: "hidden", border: `2px solid ${PAPER_INK}` }}>
            {file ? <Img src={src(file)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.15)" }} /> : <div style={{ width: "100%", height: "100%", backgroundImage: `repeating-linear-gradient(45deg, ${alpha(PAPER_INK, 0.18)} 0 2px, transparent 2px 9px)` }} />}
          </div>
          <div style={{ flex: 1 }}>{[100, 92, 97, 88, 95, 70, 98, 84, 90].map(bar)}</div>
        </div>
        <div style={{ marginTop: 18, height: 6, width: 120, background: theme.accent }} />
      </div>
    </Safe>
  );
};

/* ─────────────────────────── BOARDING PASS ───────────────────────────
 * A ticket slides up: FROM → TO airport-style codes, a plane flies the arc, the stub gets stamped. */
export const BoardingPass: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const from = prop<string>(beat, "from", "Then");
  const to = prop<string>(beat, "to", "Now");
  const code = (s: string) => s.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "???";
  const fromCode = prop<string>(beat, "fromCode", code(from));
  const toCode = prop<string>(beat, "toCode", code(to));
  const date = prop<string>(beat, "date", "");
  const stamp = prop<string>(beat, "stamp", "DEPARTED");
  const label = prop<string>(beat, "label", "BOARDING PASS");
  const s = pop(frame, fps, 0, "snap");
  const fly = easeInOut(frame, 8, Math.max(14, beat.frames * 0.45));
  const stampAt = Math.floor(beat.frames * 0.6);
  const st = frame >= stampAt ? pop(frame, fps, stampAt, "slam") : 0;
  const px = 230 + fly * 300, py = 150 - Math.sin(fly * Math.PI) * 70;
  const field = (k: string, v: string) => (
    <div key={k}><div style={{ fontFamily: theme.mono, fontSize: 20, letterSpacing: 3, color: theme.dim }}>{k}</div><div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 30, color: theme.ink }}>{v}</div></div>
  );
  return (
    <Safe>
      <div style={{ position: "relative", width: 920, height: 560, display: "flex", transform: `translateY(${(1 - s) * 420}px) rotate(${(1 - s) * -8}deg)`, opacity: s, borderRadius: 28, boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ flex: 1, background: theme.surface, borderRadius: "28px 0 0 28px", padding: "34px 40px", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.mono, fontWeight: 700, fontSize: 24, letterSpacing: 4, color: theme.accent }}><span>{label}</span><span>✈</span></div>
          <svg width={600} height={220} style={{ position: "absolute", left: 40, top: 70 }}>
            <path d="M 70 150 Q 300 30 530 150" stroke={alpha(theme.ink, 0.35)} strokeWidth={3} strokeDasharray="10 10" fill="none" />
            <text x={px - 40} y={py + 14} fontSize={46} fill={theme.accent} transform={`rotate(${interpolate(fly, [0, 0.5, 1], [-25, 0, 25])} ${px - 22} ${py})`}>✈</text>
          </svg>
          <div style={{ position: "absolute", left: 40, right: 40, top: 230, display: "flex", justifyContent: "space-between" }}>
            <div><div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 112, lineHeight: 1, color: theme.ink }}>{fromCode}</div><div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 30, color: theme.dim }}>{short(from, 16)}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 112, lineHeight: 1, color: theme.ink }}>{toCode}</div><div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 30, color: theme.dim }}>{short(to, 16)}</div></div>
          </div>
          <div style={{ position: "absolute", left: 40, right: 40, bottom: 34, display: "flex", justifyContent: "space-between" }}>
            {field("DATE", date || "—")}{field("GATE", "A1")}{field("SEAT", "01A")}{field("CLASS", "HISTORY")}
          </div>
        </div>
        <div style={{ width: 0, borderLeft: `4px dashed ${alpha(theme.ink, 0.35)}`, position: "relative", background: theme.surface }}>
          <div style={{ position: "absolute", left: -22, top: -20, width: 40, height: 40, borderRadius: 20, background: theme.bg }} />
          <div style={{ position: "absolute", left: -22, bottom: -20, width: 40, height: 40, borderRadius: 20, background: theme.bg }} />
        </div>
        <div style={{ width: 200, background: theme.accent, borderRadius: "0 28px 28px 0", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", padding: "34px 10px", color: theme.onAccent }}>
          <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 22, letterSpacing: 3 }}>STUB</div>
          <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 54, lineHeight: 1.05, textAlign: "center" }}>{fromCode}<br />↓<br />{toCode}</div>
          <div style={{ display: "flex", gap: 3 }}>{Array.from({ length: 14 }, (_, i) => <div key={i} style={{ width: hash01(i, 7) > 0.5 ? 6 : 3, height: 54, background: theme.onAccent }} />)}</div>
        </div>
        {st > 0 ? <div style={{ position: "absolute", right: 120, top: 40, transform: `rotate(-14deg) scale(${interpolate(st, [0, 1], [2.6, 1])})`, opacity: Math.min(1, st * 1.6), border: `8px solid ${theme.ink}`, color: theme.ink, borderRadius: 14, padding: "4px 22px", fontFamily: theme.mono, fontWeight: 700, fontSize: 46, letterSpacing: 4 }}>{stamp}</div> : null}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── MAP ROUTE ───────────────────────────
 * Stylised map (seeded land blobs + graticule); a route draws between named stops while a marker
 * travels it; each stop pops its label as the marker arrives. Voyages, trade routes, migrations. */
type Stop = { name: string; x?: number; y?: number };
export const MapRoute: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const raw = prop<Stop[]>(beat, "points", [{ name: "Start" }, { name: "Crossing" }, { name: "Arrival" }]).slice(0, 4);
  const stops = (raw.length >= 2 ? raw : [{ name: "Start" }, { name: "End" }]).map((p, i, arr) => ({
    name: String(p?.name ?? `Stop ${i + 1}`),
    x: typeof p?.x === "number" ? p.x : 0.14 + (i / Math.max(1, arr.length - 1)) * 0.72,
    y: typeof p?.y === "number" ? p.y : 0.25 + hash01(i, seed, 3) * 0.5,
  }));
  const title = prop<string>(beat, "title", "");
  const W = 900, H = 960, ox = 90, oy = 300;
  // Sample the curved route (quadratic segments) into a polyline with cumulative length.
  const pts: { x: number; y: number }[] = [];
  stops.forEach((p, i) => {
    if (i === 0) { pts.push({ x: p.x * W, y: p.y * H }); return; }
    const a = stops[i - 1];
    const cx = ((a.x + p.x) / 2) * W, cy = ((a.y + p.y) / 2) * H - 120;
    for (let k = 1; k <= 30; k++) {
      const t = k / 30;
      pts.push({ x: (1 - t) * (1 - t) * a.x * W + 2 * (1 - t) * t * cx + t * t * p.x * W, y: (1 - t) * (1 - t) * a.y * H + 2 * (1 - t) * t * cy + t * t * p.y * H });
    }
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const prog = easeInOut(frame, 6, Math.max(16, beat.frames * 0.7));
  const L = prog * total;
  let k = 0;
  while (k < pts.length - 1 && cum[k + 1] < L) k++;
  const segT = cum[k + 1] !== undefined ? (L - cum[k]) / Math.max(0.001, cum[k + 1] - cum[k]) : 0;
  const head = pts[k + 1] ? { x: pts[k].x + (pts[k + 1].x - pts[k].x) * segT, y: pts[k].y + (pts[k + 1].y - pts[k].y) * segT } : pts[k];
  const drawn = [...pts.slice(0, k + 1), head].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const stopReached = (i: number) => (i === 0 || k + 1 >= i * 30 ? 1 : 0);
  const blobs = Array.from({ length: 7 }, (_, b) => {
    const cx = hash01(b, seed, 11) * W, cy = hash01(b, seed, 12) * H, r = 90 + hash01(b, seed, 13) * 150;
    let d = "";
    for (let a = 0; a <= 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const rr = r * (0.7 + hash01(b, a % 16, seed) * 0.5);
      d += `${a ? "L" : "M"}${(cx + Math.cos(ang) * rr).toFixed(0)} ${(cy + Math.sin(ang) * rr * 0.75).toFixed(0)}`;
    }
    return d + "Z";
  });
  return (
    <AbsoluteFill>
      {title ? <div style={{ position: "absolute", left: 0, right: 0, top: 230, textAlign: "center", fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: 64, color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none" }}>{title}</div> : null}
      <svg width={W} height={H} style={{ position: "absolute", left: ox, top: oy, borderRadius: 30, background: theme.surface }}>
        {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * (W / 10)} y1={0} x2={(i + 1) * (W / 10)} y2={H} stroke={alpha(theme.ink, 0.07)} strokeWidth={2} />)}
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={0} y1={(i + 1) * (H / 10)} x2={W} y2={(i + 1) * (H / 10)} stroke={alpha(theme.ink, 0.07)} strokeWidth={2} />)}
        {blobs.map((d, b) => <path key={b} d={d} fill={alpha(theme.ink, 0.09)} stroke={alpha(theme.ink, 0.22)} strokeWidth={2} />)}
        <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={alpha(theme.ink, 0.28)} strokeWidth={4} strokeDasharray="12 12" />
        <polyline points={drawn} fill="none" stroke={theme.accent} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        {stops.map((p, i) => <circle key={i} cx={p.x * W} cy={p.y * H} r={14} fill={stopReached(i) ? theme.accent : theme.bg} stroke={theme.accent} strokeWidth={5} />)}
        <circle cx={head.x} cy={head.y} r={22} fill={theme.ink} />
        <circle cx={head.x} cy={head.y} r={10} fill={theme.accent} />
      </svg>
      {stops.map((p, i) => {
        const o = stopReached(i) ? 1 : 0;
        return <div key={i} style={{ position: "absolute", left: ox + p.x * W, top: oy + p.y * H + 26, transform: `translateX(-50%) scale(${0.85 + o * 0.15})`, opacity: 0.25 + o * 0.75, padding: "6px 16px", borderRadius: 10, background: o ? theme.accent : theme.surface, color: o ? theme.onAccent : theme.ink, fontFamily: theme.body, fontWeight: 900, fontSize: 30, whiteSpace: "nowrap" }}>{short(p.name, 18)}</div>;
      })}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── DNA HELIX ───────────────────────────
 * A rotating 3D double helix: two backbones + base-pair rungs, depth-sorted so the twist reads. */
export const DnaHelix: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const label = prop<string>(beat, "label", "");
  const N = 24, cx = 540, top = 300, gap = 38, R = 170;
  const spin = frame * 0.07;
  const o = easeOut(frame, 0, 12);
  const pairs = Array.from({ length: N }, (_, i) => {
    const a = i * 0.48 + spin;
    return { i, y: top + i * gap, x1: cx + Math.cos(a) * R, x2: cx - Math.cos(a) * R, z: Math.sin(a) };
  });
  const order = [...pairs].sort((p, q) => p.z - q.z);
  const PAIRS = [theme.accent, theme.accent2, theme.ink];
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: o, transform: `rotate(-14deg)`, transformOrigin: `${cx}px ${top + (N * gap) / 2}px` }}>
        {order.map((p) => {
          const depth = (p.z + 1) / 2;
          const c = PAIRS[p.i % 3];
          return (
            <g key={p.i} opacity={0.35 + depth * 0.65}>
              <line x1={p.x1} y1={p.y} x2={(p.x1 + p.x2) / 2} y2={p.y} stroke={c} strokeWidth={8} strokeLinecap="round" />
              <line x1={(p.x1 + p.x2) / 2} y1={p.y} x2={p.x2} y2={p.y} stroke={PAIRS[(p.i + 1) % 3]} strokeWidth={8} strokeLinecap="round" />
              <circle cx={p.x1} cy={p.y} r={10 + depth * 9} fill={theme.accent} />
              <circle cx={p.x2} cy={p.y} r={10 + (1 - depth) * 9} fill={theme.ink} />
            </g>
          );
        })}
      </svg>
      {label ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: top + N * gap + 40, textAlign: "center", opacity: easeOut(frame, 8, 10) }}>
          <span style={{ display: "inline-block", padding: "12px 30px", borderRadius: 999, background: theme.surface, fontFamily: theme.body, fontWeight: 900, fontSize: 44, color: theme.ink }}>{label}</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── ATOM ───────────────────────────
 * Nucleus cluster + electrons racing tilted 3D orbits (depth-sorted around the nucleus);
 * a periodic-table tile names the element. */
export const Atom: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const symbol = prop<string>(beat, "symbol", "H");
  const name = prop<string>(beat, "name", "Hydrogen");
  const number = prop<string>(beat, "number", "1");
  const cx = 540, cy = 760, RX = 360, RY = 110;
  const s = pop(frame, fps, 0, "smooth");
  const orbits = [0, 60, 120];
  const electrons = orbits.flatMap((deg, o) => [0, 1].map((e) => {
    const t = frame * (0.07 + o * 0.015) + e * Math.PI + hash01(o, seed) * 6;
    const ex = Math.cos(t) * RX * s, ey = Math.sin(t) * RY * s;
    const r = (deg * Math.PI) / 180;
    return { key: `${o}-${e}`, x: cx + ex * Math.cos(r) - ey * Math.sin(r), y: cy + ex * Math.sin(r) + ey * Math.cos(r), z: Math.sin(t) };
  }));
  const nucleus = Array.from({ length: 9 }, (_, i) => ({ x: cx + (hash01(i, 1) - 0.5) * 70, y: cy + (hash01(i, 2) - 0.5) * 70, p: i % 2 === 0 }));
  const electron = (e: (typeof electrons)[number]) => <circle key={e.key} cx={e.x} cy={e.y} r={14 + (e.z + 1) * 4} fill={theme.accent2} stroke={theme.ink} strokeWidth={2} />;
  const tile = pop(frame, fps, 10, "snap");
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {orbits.map((deg) => <ellipse key={deg} cx={cx} cy={cy} rx={RX * s} ry={RY * s} fill="none" stroke={alpha(theme.ink, 0.3)} strokeWidth={3} transform={`rotate(${deg} ${cx} ${cy})`} />)}
        {electrons.filter((e) => e.z < 0).map(electron)}
        {nucleus.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={28 * s} fill={n.p ? theme.accent : alpha(theme.ink, 0.75)} stroke={theme.bg} strokeWidth={2} />)}
        {electrons.filter((e) => e.z >= 0).map(electron)}
      </svg>
      <div style={{ position: "absolute", left: 540 - 150, top: 1040, width: 300, height: 260, borderRadius: 26, background: theme.surface, border: `4px solid ${theme.accent}`, padding: "18px 24px", transform: `scale(${tile})`, color: theme.ink }}>
        <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 30, color: theme.accent }}>{number}</div>
        <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 120, lineHeight: 1, textAlign: "center" }}>{short(symbol, 3)}</div>
        <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 30, textAlign: "center" }}>{short(name, 14)}</div>
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── SOLAR SYSTEM ───────────────────────────
 * Glowing sun, tilted elliptical orbits, planets at seeded speeds passing behind/in front of the sun;
 * optionally one planet is called out with a label that rides with it. */
export const SolarSystem: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const names = prop<string[]>(beat, "planets", []);
  const highlight = prop(beat, "highlight", -1);
  const label = prop<string>(beat, "label", "");
  const cx = 540, cy = 800;
  const s = pop(frame, fps, 0, "smooth");
  const planets = Array.from({ length: 6 }, (_, i) => {
    const rx = 130 + i * 64, ry = rx * 0.34;
    const a = hash01(i, seed) * Math.PI * 2 + frame * (0.05 / (1 + i * 0.55));
    return { i, rx, ry, x: cx + Math.cos(a) * rx * s, y: cy + Math.sin(a) * ry * s, z: Math.sin(a), r: [12, 18, 20, 15, 38, 32][i] };
  });
  const tones = [theme.accent2, theme.accent, theme.ink, theme.accent, theme.accent2, theme.ink];
  const planet = (p: (typeof planets)[number]) => (
    <g key={p.i}>
      <circle cx={p.x} cy={p.y} r={p.r * (0.85 + (p.z + 1) * 0.12)} fill={tones[p.i]} stroke={alpha(theme.bg, 0.6)} strokeWidth={2} />
      {p.i === 4 ? <ellipse cx={p.x} cy={p.y} rx={p.r * 1.8} ry={p.r * 0.45} fill="none" stroke={alpha(theme.ink, 0.6)} strokeWidth={3} /> : null}
    </g>
  );
  const hl = planets.find((p) => p.i === highlight);
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id={`sun${beat.index}`} cx="40%" cy="38%" r="65%">
            <stop offset="0" stopColor={theme.accent2} />
            <stop offset="0.55" stopColor={theme.accent} />
            <stop offset="1" stopColor={alpha(theme.accent, 0)} />
          </radialGradient>
        </defs>
        {planets.map((p) => <ellipse key={`o${p.i}`} cx={cx} cy={cy} rx={p.rx * s} ry={p.ry * s} fill="none" stroke={alpha(theme.ink, p.i === highlight ? 0.55 : 0.18)} strokeWidth={p.i === highlight ? 4 : 2} />)}
        {planets.filter((p) => p.z < 0).map(planet)}
        <circle cx={cx} cy={cy} r={150 * s} fill={`url(#sun${beat.index})`} />
        <circle cx={cx} cy={cy} r={62 * s} fill={theme.accent} />
        {planets.filter((p) => p.z >= 0).map(planet)}
      </svg>
      {hl && (label || names[highlight]) ? (
        <div style={{ position: "absolute", left: hl.x + 40, top: hl.y - 80, padding: "8px 20px", borderRadius: 12, background: theme.accent, color: theme.onAccent, fontFamily: theme.body, fontWeight: 900, fontSize: 36, whiteSpace: "nowrap", opacity: easeOut(frame, 8, 8) }}>{short(label || names[highlight], 20)}</div>
      ) : null}
      {!hl && label ? <div style={{ position: "absolute", left: 0, right: 0, top: 1170, textAlign: "center", fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: 70, color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none", opacity: easeOut(frame, 8, 10) }}>{label}</div> : null}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── CIRCUIT BOARD ───────────────────────────
 * PCB: orthogonal copper traces light up edge → chip, pulses keep flowing into the central chip. */
export const CircuitBoard: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const label = prop<string>(beat, "label", "AI");
  const W = 900, H = 900, ox = 90, oy = 300, chip = 230;
  const cX = W / 2, cY = H / 2;
  const traces = Array.from({ length: 16 }, (_, i) => {
    const side = i % 4; // 0 top 1 right 2 bottom 3 left
    const slot = Math.floor(i / 4);
    const pin = -chip / 2 + 40 + slot * ((chip - 80) / 3);
    const jog = 60 + hash01(i, seed) * 160;
    let pts: [number, number][];
    if (side === 0) { const sx = 60 + hash01(i, seed, 2) * (W - 120); pts = [[sx, 0], [sx, cY - chip / 2 - jog], [cX + pin, cY - chip / 2 - jog], [cX + pin, cY - chip / 2]]; }
    else if (side === 2) { const sx = 60 + hash01(i, seed, 2) * (W - 120); pts = [[sx, H], [sx, cY + chip / 2 + jog], [cX + pin, cY + chip / 2 + jog], [cX + pin, cY + chip / 2]]; }
    else if (side === 1) { const sy = 60 + hash01(i, seed, 2) * (H - 120); pts = [[W, sy], [cX + chip / 2 + jog, sy], [cX + chip / 2 + jog, cY + pin], [cX + chip / 2, cY + pin]]; }
    else { const sy = 60 + hash01(i, seed, 2) * (H - 120); pts = [[0, sy], [cX - chip / 2 - jog, sy], [cX - chip / 2 - jog, cY + pin], [cX - chip / 2, cY + pin]]; }
    const segs = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
    return { pts, len: segs.reduce((a, b) => a + b, 0), segs, start: 2 + (i % 8) * 3 };
  });
  const at = (t: (typeof traces)[number], d: number): [number, number] => {
    let rem = d;
    for (let k = 0; k < t.segs.length; k++) {
      if (rem <= t.segs[k]) { const f = rem / Math.max(0.001, t.segs[k]); return [t.pts[k][0] + (t.pts[k + 1][0] - t.pts[k][0]) * f, t.pts[k][1] + (t.pts[k + 1][1] - t.pts[k][1]) * f]; }
      rem -= t.segs[k];
    }
    return t.pts[t.pts.length - 1];
  };
  const glow = easeOut(frame, beat.frames * 0.45, 10);
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", left: ox, top: oy, borderRadius: 34, background: theme.surface }}>
        {traces.map((t, i) => {
          const d = t.pts.map((p) => p.join(",")).join(" ");
          const lit = easeOut(frame, t.start, 14);
          return (
            <g key={i}>
              <polyline points={d} fill="none" stroke={alpha(theme.ink, 0.16)} strokeWidth={7} strokeLinejoin="round" />
              <polyline points={d} fill="none" stroke={theme.accent} strokeWidth={7} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - lit} />
              <circle cx={t.pts[0][0]} cy={t.pts[0][1]} r={13} fill={theme.bg} stroke={theme.accent} strokeWidth={5} />
            </g>
          );
        })}
        {traces.map((t, i) => {
          if (frame < t.start + 10) return null;
          const d = ((frame - t.start) * 14 + i * 37) % t.len;
          const [x, y] = at(t, d);
          return <circle key={`p${i}`} cx={x} cy={y} r={9} fill={theme.accent2} />;
        })}
        <rect x={cX - chip / 2} y={cY - chip / 2} width={chip} height={chip} rx={20} fill={theme.bg} stroke={theme.accent} strokeWidth={6 + glow * 4} />
        {Array.from({ length: 4 }, (_, k) => [0, 1, 2, 3].map((side) => {
          const p = -chip / 2 + 40 + k * ((chip - 80) / 3);
          const pos = side === 0 ? [cX + p - 6, cY - chip / 2 - 16] : side === 2 ? [cX + p - 6, cY + chip / 2 + 4] : side === 1 ? [cX + chip / 2 + 4, cY + p - 6] : [cX - chip / 2 - 16, cY + p - 6];
          return <rect key={`${k}-${side}`} x={pos[0]} y={pos[1]} width={12} height={12} fill={theme.ink} />;
        }))}
      </svg>
      <div style={{ position: "absolute", left: ox + cX - chip / 2, top: oy + cY - chip / 2, width: chip, height: chip, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: theme.display, fontWeight: 900, fontSize: fitSize([label], chip - 40, 96, 34, 0.62), color: glow > 0.5 ? theme.accent : theme.ink, padding: 16 }}>{label}</div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── HEARTBEAT ───────────────────────────
 * Patient monitor: the ECG trace writes across the screen (old pass ahead of the write-head),
 * a heart icon and BPM counter pulse on every spike. Health, tension, "still alive". */
const ecg = (x: number) => {
  const p = ((x % 300) + 300) % 300;
  if (p < 40) return Math.sin((p / 40) * Math.PI) * 14; // P wave
  if (p > 70 && p < 82) return -(p - 70) * 2.5; // Q
  if (p >= 82 && p < 96) return -30 + (p - 82) * 15; // R up
  if (p >= 96 && p < 110) return 180 - (p - 96) * 17; // R down / S
  if (p > 150 && p < 210) return Math.sin(((p - 150) / 60) * Math.PI) * 30; // T wave
  return 0;
};
export const Heartbeat: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const bpm = prop(beat, "bpm", 72);
  const label = prop<string>(beat, "label", "BPM");
  const caption = prop<string>(beat, "caption", "");
  const W = 900, H = 520, base = 300;
  const speed = 14;
  const headX = (frame * speed) % W;
  const pass = Math.floor((frame * speed) / W);
  const cur: string[] = [], prev: string[] = [];
  for (let x = 0; x <= W; x += 6) {
    const yCur = base - ecg(x + pass * W);
    const yPrev = base - ecg(x + (pass - 1) * W);
    if (x <= headX) cur.push(`${x},${yCur.toFixed(1)}`);
    else if (x > headX + 50) prev.push(`${x},${yPrev.toFixed(1)}`);
  }
  const spike = ecg(headX + pass * W) > 90;
  const s = pop(frame, fps, 0, "snap");
  const shown = Math.round(bpm + (hash01(Math.floor(frame / 12)) - 0.5) * 3);
  return (
    <Safe>
      <div style={{ position: "relative", width: W, height: H, borderRadius: 34, overflow: "hidden", background: theme.surface, border: `3px solid ${alpha(theme.ink, 0.15)}`, transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`, opacity: s }}>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: 15 }, (_, i) => <line key={`v${i}`} x1={i * 60} y1={0} x2={i * 60} y2={H} stroke={alpha(theme.accent, 0.12)} strokeWidth={2} />)}
          {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 60} x2={W} y2={i * 60} stroke={alpha(theme.accent, 0.12)} strokeWidth={2} />)}
          {prev.length > 1 ? <polyline points={prev.join(" ")} fill="none" stroke={alpha(theme.accent, 0.3)} strokeWidth={5} strokeLinejoin="round" /> : null}
          {cur.length > 1 ? <polyline points={cur.join(" ")} fill="none" stroke={theme.accent} strokeWidth={6} strokeLinejoin="round" /> : null}
          <circle cx={headX} cy={base - ecg(headX + pass * W)} r={12} fill={theme.ink} />
        </svg>
        <div style={{ position: "absolute", left: 34, top: 26, fontFamily: theme.mono, fontWeight: 700, fontSize: 26, letterSpacing: 4, color: theme.dim }}>● LIVE MONITOR</div>
      </div>
      <div style={{ marginTop: 38, display: "flex", alignItems: "center", gap: 34 }}>
        <div style={{ fontSize: 110, color: theme.accent, transform: `scale(${spike ? 1.22 : 1})`, lineHeight: 1 }}>♥</div>
        <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 150, lineHeight: 1, color: theme.ink }}>{shown}</div>
        <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 40, color: theme.dim }}>{short(label, 10)}</div>
      </div>
      {caption ? <div style={{ marginTop: 20, fontFamily: theme.body, fontWeight: 800, fontSize: 42, color: theme.ink, textAlign: "center" }}>{caption}</div> : null}
    </Safe>
  );
};

/* ─────────────────────────── MAGNIFIER ───────────────────────────
 * Fine print on a card; a magnifying glass glides over it and stops on the hidden detail,
 * which is enlarged inside the lens and then highlighted. Fact-checks, research, the catch. */
export const Magnifier: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const detail = prop<string>(beat, "detail", short(beat.text.replace(/[.!?]$/, ""), 38));
  const label = prop<string>(beat, "label", "");
  const words = (prop<string>(beat, "text", "") || `${beat.text} terms conditions apply see notes below for details`).split(/\s+/).filter(Boolean);
  const CW = 880, CH = 640, LH = 52, R = 170, K = 2.1;
  const filler = (row: number) => Array.from({ length: 9 }, (_, i) => words[(row * 9 + i) % words.length]).join(" ");
  const ROWS = 9, DETAIL_ROW = 6;
  const arrive = easeInOut(frame, 4, Math.max(14, beat.frames * 0.45));
  const tx = CW / 2, ty = 60 + DETAIL_ROW * LH + LH / 2;
  const lx = interpolate(arrive, [0, 1], [180, tx]) + Math.sin(frame / 9) * 4 * (1 - arrive);
  const ly = interpolate(arrive, [0, 1], [150, ty]);
  const hl = easeOut(frame, 4 + beat.frames * 0.45, 8);
  const content = (): React.ReactNode => (
    <div style={{ width: CW, height: CH, padding: "60px 50px", background: theme.surface, color: theme.ink, fontFamily: theme.body }}>
      {Array.from({ length: ROWS }, (_, r) => (
        <div key={r} style={{ height: LH, display: "flex", alignItems: "center", justifyContent: r === DETAIL_ROW ? "center" : "flex-start", fontSize: r === DETAIL_ROW ? 24 : 22, fontWeight: r === DETAIL_ROW ? 800 : 500, color: r === DETAIL_ROW ? theme.ink : alpha(theme.ink, 0.5), whiteSpace: "nowrap", overflow: "hidden" }}>
          {r === DETAIL_ROW ? <span style={{ padding: "2px 8px", background: alpha(theme.accent, 0.55 * hl) }}>{detail}</span> : filler(r)}
        </div>
      ))}
    </div>
  );
  return (
    <Safe>
      <div style={{ position: "relative", width: CW, height: CH, borderRadius: 26, overflow: "visible", boxShadow: "0 30px 70px rgba(0,0,0,0.35)" }}>
        <div style={{ borderRadius: 26, overflow: "hidden" }}>{content()}</div>
        <div style={{ position: "absolute", left: lx - R - 14, top: ly - R - 14, width: R * 2, height: R * 2, borderRadius: R + 14, overflow: "hidden", border: `14px solid ${theme.ink}`, boxShadow: "0 20px 40px rgba(0,0,0,0.45)" }}>
          <div style={{ position: "absolute", left: R - lx * K, top: R - ly * K, transform: `scale(${K})`, transformOrigin: "0 0" }}>{content()}</div>
        </div>
        <div style={{ position: "absolute", left: lx + R * 0.62, top: ly + R * 0.62, width: 40, height: 190, borderRadius: 20, background: theme.ink, transform: "rotate(-45deg)", transformOrigin: "20px 0" }} />
      </div>
      {label ? <div style={{ marginTop: 34, padding: "12px 30px", borderRadius: 14, background: theme.accent, color: theme.onAccent, fontFamily: theme.body, fontWeight: 900, fontSize: 40, opacity: hl }}>{label}</div> : null}
    </Safe>
  );
};

/* ─────────────────────────── CHALKBOARD ───────────────────────────
 * A formula or a few lines are hand-written line by line (handwriting font revealed left→right with
 * the chalk tip and dust). Adapts: chalkboard on dark/vivid themes, marker whiteboard on light ones. */
export const Chalkboard: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const lines = prop<string[]>(beat, "lines", [beat.text]).slice(0, 4).map((l) => String(l));
  const title = prop<string>(beat, "title", "");
  const BW = 920, BH = 680;
  const total = Math.max(14, beat.frames * 0.7);
  const per = total / Math.max(1, lines.length);
  const size = Math.min(110, ...lines.map((l) => fitSize([l], BW - 140, 110, 44, 0.42)));
  let tip: { x: number; y: number } | null = null;
  const rows = lines.map((l, i) => {
    const p = easeInOut(frame, 4 + i * per, per * 0.9);
    const y = 120 + (title ? 70 : 0) + i * (size * 1.25);
    if (p > 0 && p < 1) tip = { x: 70 + p * Math.min(BW - 140, l.length * size * 0.42), y: y + size * 0.55 };
    return { l, p, y };
  });
  const t = tip as { x: number; y: number } | null;
  return (
    <Safe>
      <div style={{ position: "relative", width: BW, height: BH, borderRadius: 18, background: theme.surface, border: `16px solid ${alpha(theme.ink, 0.25)}`, boxShadow: "0 30px 70px rgba(0,0,0,0.35)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${alpha(theme.ink, 0.05)} 1px, transparent 1.5px)`, backgroundSize: "9px 9px" }} />
        {title ? <div style={{ position: "absolute", left: 70, top: 40, fontFamily: HAND, fontWeight: 700, fontSize: 52, color: theme.accent }}>{title}</div> : null}
        {rows.map((r, i) => (
          <div key={i} style={{ position: "absolute", left: 70, top: r.y, width: BW - 140, height: size * 1.25, overflow: "hidden" }}>
            <div style={{ width: `${r.p * 100}%`, overflow: "hidden", whiteSpace: "nowrap", fontFamily: HAND, fontWeight: 700, fontSize: size, lineHeight: 1.1, color: theme.ink }}>{r.l}</div>
          </div>
        ))}
        {t ? (
          <>
            <div style={{ position: "absolute", left: t.x - 6, top: t.y - 30, width: 18, height: 60, borderRadius: 6, background: theme.ink, transform: "rotate(25deg)" }} />
            {Array.from({ length: 6 }, (_, k) => <div key={k} style={{ position: "absolute", left: t.x + (hash01(frame, k) - 0.5) * 30, top: t.y + 30 + ((frame + k * 7) % 20) * 4, width: 5, height: 5, borderRadius: 3, background: alpha(theme.ink, 0.5) }} />)}
          </>
        ) : null}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 26, background: alpha(theme.ink, 0.2) }} />
      </div>
    </Safe>
  );
};

/* ─────────────────────────── POLAROID STACK ───────────────────────────
 * Polaroids drop onto a pile one by one, each with a handwritten caption. The first can carry a real
 * image (props.src); the rest get tasteful generated scenes (sun, hills, sky) in theme colours. */
type Pola = { caption: string; src?: string };
export const PolaroidStack: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const first = prop<string>(beat, "src", "");
  const raw = prop<(Pola | string)[]>(beat, "items", [beat.text.split(/[,.;]/)[0] || "memories"]);
  const items: Pola[] = raw.slice(0, 4).map((x) => (typeof x === "string" ? { caption: x } : { caption: String(x?.caption ?? ""), src: x?.src })).map((x, i) => ({ ...x, src: x.src || (i === 0 ? first : "") }));
  const step = Math.max(6, Math.floor((beat.frames * 0.6) / Math.max(1, items.length)));
  const scene = (i: number) => {
    const sunX = 20 + hash01(i, seed) * 60, hill = 55 + hash01(i, seed, 2) * 15;
    return (
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${theme.accent2}, ${theme.accent})` }}>
        <div style={{ position: "absolute", left: `${sunX}%`, top: "22%", width: 90, height: 90, borderRadius: 45, background: alpha("#FFFFFF", 0.85) }} />
        <div style={{ position: "absolute", left: "-10%", right: "-10%", bottom: 0, height: `${100 - hill}%`, background: alpha(theme.bg, 0.55), borderRadius: "50% 50% 0 0" }} />
        <div style={{ position: "absolute", left: "30%", right: "-20%", bottom: 0, height: `${85 - hill}%`, background: alpha(theme.bg, 0.8), borderRadius: "60% 40% 0 0" }} />
      </div>
    );
  };
  return (
    <AbsoluteFill>
      {items.map((it, i) => {
        const at = 3 + i * step;
        if (frame < at) return null;
        const s = pop(frame, fps, at, "slam");
        const rot = (hash01(i, seed, 5) - 0.5) * 18;
        const x = 540 - 300 + (hash01(i, seed, 6) - 0.5) * 120;
        const y = 330 + i * 34;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 600, padding: "30px 30px 0", background: "#FBFAF6", boxShadow: "0 24px 50px rgba(0,0,0,0.45)", transform: `rotate(${rot}deg) translateY(${(1 - s) * -700}px) scale(${interpolate(s, [0, 1], [1.25, 1])})` }}>
            <div style={{ position: "relative", width: 540, height: 560, overflow: "hidden", background: "#222" }}>
              {it.src ? <Img src={src(it.src)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "saturate(0.85) contrast(1.05)" }} /> : scene(i)}
            </div>
            <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: HAND, fontWeight: 700, fontSize: fitSize([it.caption], 520, 64, 34, 0.4), color: "#22201C", textAlign: "center", padding: "0 10px" }}>{short(it.caption, 28)}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── PHONE CALL ───────────────────────────
 * Meme hook: incoming call from 'The Future' — pulsing avatar rings, slide-to-answer swipes,
 * then the call connects and a timer starts. */
export const PhoneCall: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const caller = prop<string>(beat, "caller", "The Future");
  const subtitle = prop<string>(beat, "subtitle", "incoming call…");
  const s = pop(frame, fps, 0, "smooth");
  const answerAt = Math.floor(beat.frames * 0.55);
  const swipe = easeInOut(frame, answerAt - 10, 10);
  const answered = frame >= answerAt;
  const secs = answered ? Math.floor((frame - answerAt) / fps) : 0;
  const initials = caller.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Safe>
      <div style={{ width: 540, height: 1060, borderRadius: 80, padding: 16, background: "#121214", boxShadow: "0 50px 110px rgba(0,0,0,0.55)", transform: `scale(${interpolate(s, [0, 1], [0.85, 1])}) rotate(${answered ? 0 : Math.sin(frame * 1.7) * 1.2}deg)`, opacity: s }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 66, overflow: "hidden", background: `linear-gradient(180deg, ${theme.bg2}, ${theme.bg})`, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: theme.body, color: theme.ink }}>
          <div style={{ marginTop: 26, width: 130, height: 34, borderRadius: 17, background: "#000" }} />
          <div style={{ marginTop: 70, fontSize: 30, fontWeight: 600, color: theme.dim }}>{answered ? `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}` : subtitle}</div>
          <div style={{ marginTop: 12, fontSize: fitSize(caller.split(/\s+/), 460, 74, 40, 0.56), fontWeight: 900, textAlign: "center", padding: "0 24px", lineHeight: 1.05 }}>{caller}</div>
          <div style={{ position: "relative", marginTop: 90, width: 220, height: 220 }}>
            {!answered ? [0, 1, 2].map((r) => {
              const ph = ((frame + r * 12) % 36) / 36;
              return <div key={r} style={{ position: "absolute", inset: -ph * 110, borderRadius: "50%", border: `4px solid ${theme.accent}`, opacity: 1 - ph }} />;
            }) : null}
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.display, fontWeight: 900, fontSize: 90, color: theme.onAccent }}>{initials || "?"}</div>
          </div>
          <div style={{ position: "absolute", left: 40, right: 40, bottom: 80 }}>
            {answered ? (
              <div style={{ display: "flex", justifyContent: "space-around" }}>
                {["mute", "keypad", "speaker"].map((b) => <div key={b} style={{ width: 110, height: 110, borderRadius: 55, background: theme.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: theme.ink }}>{b}</div>)}
              </div>
            ) : (
              <div style={{ position: "relative", height: 110, borderRadius: 55, background: theme.surface, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: theme.dim, opacity: 1 - swipe }}>slide to answer</div>
                <div style={{ position: "absolute", top: 8, left: 8 + swipe * (460 - 16 - 94 - 80), width: 94, height: 94, borderRadius: 47, background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, color: theme.onAccent }}>✆</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Safe>
  );
};
