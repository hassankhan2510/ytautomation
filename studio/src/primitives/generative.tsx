/**
 * GENERATIVE WORLDS — no photo needed. Every scene is drawn by code from the job seed, so the same
 * primitive looks different in every video (different star field, blob shape, flow lines, globe spin).
 * All SVG/DOM (CPU-safe on GitHub runners).
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { noise2D, noise3D } from "@remotion/noise";
import { useRender } from "../engine/render-context";
import { alpha, type Theme } from "../engine/theme";
import { easeInOut, easeOut, fitSize, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { localWords, prop, Safe, type PrimitiveProps } from "./common";

const W = 1080, H = 1920;

/** Big hero word shared by the generative scenes. */
const Hero: React.FC<{ text: string; theme: Theme; s: number; y?: number; max?: number; glow?: boolean }> = ({ text, theme, s, y = 0, max = 170, glow = true }) => {
  const size = fitSize(text.split(/\s+/), 920, max, 70, 0.56);
  return (
    <Safe>
      <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size, lineHeight: 0.95, textAlign: "center", color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none", transform: `translateY(${y}px) scale(${interpolate(s, [0, 1], [0.6, 1])})`, opacity: Math.min(1, s * 1.4), textShadow: glow ? `0 0 50px ${alpha(theme.bg, 0.9)}, 0 0 80px ${alpha(theme.accent, 0.45)}` : "none", maxWidth: 940 }}>{text}</div>
    </Safe>
  );
};

/* ─────────────────────────── GLOBE ───────────────────────────
 * Rotating wireframe planet; arcs launch between cities and draw across the globe. Global/market beats. */
type Pin = { name: string; lat: number; lon: number };
const DEFAULT_PINS: Pin[] = [
  { name: "Karachi", lat: 24.86, lon: 67.0 }, { name: "Dubai", lat: 25.2, lon: 55.3 }, { name: "London", lat: 51.5, lon: -0.1 },
  { name: "Lagos", lat: 6.5, lon: 3.4 }, { name: "Singapore", lat: 1.35, lon: 103.8 }, { name: "Istanbul", lat: 41.0, lon: 28.9 },
];
export const Globe: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const pins = prop<Pin[]>(beat, "pins", DEFAULT_PINS);
  const label = prop(beat, "label", "");
  const R = 400, cx = W / 2, cy = 860;
  const tilt = 0.38;
  const lon0 = ((45 + (seed % 30) + frame * 0.35) * Math.PI) / 180;
  const s = pop(frame, fps, 0, "smooth");
  const proj = (latD: number, lonD: number, alt = 1) => {
    const la = (latD * Math.PI) / 180, lo = (lonD * Math.PI) / 180 - lon0;
    const x = Math.cos(la) * Math.sin(lo);
    const y = Math.cos(tilt) * Math.sin(la) - Math.sin(tilt) * Math.cos(la) * Math.cos(lo);
    const z = Math.sin(tilt) * Math.sin(la) + Math.cos(tilt) * Math.cos(la) * Math.cos(lo);
    return { x: cx + x * R * alt, y: cy - y * R * alt, z };
  };
  let front = "", back = "";
  const seg = (pts: { x: number; y: number; z: number }[]) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      if (a.z > 0 && b.z > 0) front += d; else back += d;
    }
  };
  for (let lon = -180; lon < 180; lon += 20) seg(Array.from({ length: 37 }, (_, k) => proj(-90 + k * 5, lon)));
  for (let lat = -60; lat <= 60; lat += 20) seg(Array.from({ length: 73 }, (_, k) => proj(lat, -180 + k * 5)));
  const toVec = (p: Pin) => {
    const la = (p.lat * Math.PI) / 180, lo = (p.lon * Math.PI) / 180;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const arcs = pins.slice(1).map((p, i) => {
    const a = toVec(pins[0]), b = toVec(p);
    const start = 8 + i * 7;
    const t = easeInOut(frame, start, 20);
    const pts: { x: number; y: number; z: number }[] = [];
    const N = 40;
    for (let k = 0; k <= Math.floor(N * t); k++) {
      const u = k / N;
      const v = a.map((av, j) => av * (1 - u) + b[j] * u);
      const n = Math.hypot(v[0], v[1], v[2]) || 1;
      const lat = (Math.asin(v[2] / n) * 180) / Math.PI;
      const lon = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
      pts.push(proj(lat, lon, 1 + Math.sin(u * Math.PI) * 0.22));
    }
    return { pts, done: t >= 1, end: proj(p.lat, p.lon), name: p.name };
  });
  const home = proj(pins[0].lat, pins[0].lon);
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`, transformOrigin: `${cx}px ${cy}px`, opacity: s }}>
        <defs>
          <radialGradient id={`gl${beat.index}`} cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor={alpha(theme.accent, 0.28)} />
            <stop offset="1" stopColor={alpha(theme.accent, 0)} />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R * 1.5} fill={`url(#gl${beat.index})`} />
        <circle cx={cx} cy={cy} r={R} fill={alpha(theme.bg, 0.6)} stroke={alpha(theme.accent, 0.6)} strokeWidth={3} />
        <path d={back} stroke={alpha(theme.ink, 0.07)} strokeWidth={2} fill="none" />
        <path d={front} stroke={alpha(theme.accent, 0.5)} strokeWidth={2.2} fill="none" />
        {arcs.map((a, i) => (
          <g key={i}>
            <polyline points={a.pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={theme.ink} strokeWidth={4} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${theme.accent})` }} />
            {a.done && a.end.z > 0 ? (
              <g>
                <circle cx={a.end.x} cy={a.end.y} r={10} fill={theme.accent} />
                <text x={a.end.x + 16} y={a.end.y - 12} fill={theme.ink} fontFamily={theme.mono} fontWeight={700} fontSize={26}>{a.name}</text>
              </g>
            ) : null}
          </g>
        ))}
        {home.z > 0 ? <circle cx={home.x} cy={home.y} r={14 + Math.sin(frame / 4) * 4} fill={theme.accent} style={{ filter: `drop-shadow(0 0 14px ${theme.accent})` }} /> : null}
      </svg>
      {label ? <Hero text={label} theme={theme} s={easeOut(frame, 10, 12)} y={-600} max={110} /> : null}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── WARP ───────────────────────────
 * Hyperspace: star streaks rush past the camera, then the word arrives from the vanishing point. */
export const Warp: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const word = prop(beat, "word", beat.text);
  const N = 260, cx = W / 2, cy = 900;
  const speed = interpolate(frame, [0, 12, beat.frames * 0.5, beat.frames], [0.012, 0.05, 0.03, 0.008], { extrapolateRight: "clamp" });
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const a = hash01(i, seed) * Math.PI * 2;
    const base = hash01(i, seed, 7);
    const z = 1 - ((base + frame * speed) % 1);
    const z2 = Math.min(1, z + speed * 2.5);
    const r1 = 40 / Math.max(0.02, z), r2 = 40 / Math.max(0.02, z2);
    const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1;
    const x2 = cx + Math.cos(a) * r2, y2 = cy + Math.sin(a) * r2;
    const o = Math.min(1, (1 - z) * 1.6);
    lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 7 === 0 ? theme.accent : theme.ink} strokeOpacity={o} strokeWidth={1 + (1 - z) * 4} strokeLinecap="round" />);
  }
  const s = pop(frame, fps, Math.floor(beat.frames * 0.3), "slam");
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 47%, ${alpha(theme.accent, 0.25)}, transparent 45%)` }} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>{lines}</svg>
      <Hero text={word} theme={theme} s={frame >= beat.frames * 0.3 ? s : 0} y={-60} />
    </AbsoluteFill>
  );
};

/* ─────────────────────────── BLOB ───────────────────────────
 * A liquid metaball morphs and breathes (noise-driven), with orbiting droplets; word on top. */
export const Blob: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const word = prop(beat, "word", beat.text);
  const cx = W / 2, cy = 900;
  const s = pop(frame, fps, 0, "smooth");
  const shape = (R: number, amp: number, k: string, n = 72) => {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = R * (1 + amp * noise3D(`${k}${seed}`, Math.cos(a) * 0.9, Math.sin(a) * 0.9, frame / 45));
      d += `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    }
    return d + "Z";
  };
  const id = `bl${beat.index}`;
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, transform: `scale(${s})`, transformOrigin: `${cx}px ${cy}px` }}>
        <defs>
          <radialGradient id={id} cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor={theme.accent2} stopOpacity={0.95} />
            <stop offset="0.35" stopColor={theme.accent} />
            <stop offset="1" stopColor={theme.bg2} />
          </radialGradient>
        </defs>
        <path d={shape(430, 0.28, "o")} fill={alpha(theme.accent, 0.18)} style={{ filter: "blur(30px)" }} />
        <path d={shape(380, 0.2, "m")} fill={`url(#${id})`} />
        <path d={shape(300, 0.25, "i")} fill="none" stroke={alpha("#FFFFFF", 0.25)} strokeWidth={3} />
        {[0, 1, 2].map((k) => {
          const a = frame * 0.03 + (k * Math.PI * 2) / 3 + seed;
          const rr = 480 + Math.sin(frame / 20 + k) * 30;
          return <circle key={k} cx={cx + Math.cos(a) * rr} cy={cy + Math.sin(a) * rr * 0.8} r={26 + k * 10} fill={k === 1 ? theme.ink : theme.accent} opacity={0.9} />;
        })}
      </svg>
      <Hero text={word} theme={theme} s={easeOut(frame, 4, 10)} y={-60} />
    </AbsoluteFill>
  );
};

/* ─────────────────────────── FLOW FIELD ───────────────────────────
 * Hundreds of particle trails follow a noise field like wind / ink in water. Calm, premium. */
export const FlowField: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const word = prop(beat, "word", beat.text);
  const N = 150, trail = 26, step = 9;
  const paths: React.ReactNode[] = [];
  const steps = Math.min(150, 30 + frame * 2);
  for (let i = 0; i < N; i++) {
    let x = hash01(i, seed, 1) * W, y = hash01(i, seed, 2) * H;
    const pts: string[] = [];
    for (let k = 0; k < steps; k++) {
      const a = noise2D(`f${seed}`, x * 0.0016, y * 0.0016) * Math.PI * 2.2;
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      if (k >= steps - trail) pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
    }
    paths.push(<polyline key={i} points={pts.join(" ")} fill="none" stroke={i % 5 === 0 ? theme.accent : theme.ink} strokeOpacity={i % 5 === 0 ? 0.85 : 0.22} strokeWidth={i % 5 === 0 ? 3.5 : 2} strokeLinecap="round" />);
  }
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>{paths}</svg>
      <Hero text={word} theme={theme} s={easeOut(frame, 6, 12)} />
    </AbsoluteFill>
  );
};

/* ─────────────────────────── ISO BUILD ───────────────────────────
 * Isometric blocks drop and stack into a tower, one per layer label — literally "building it". */
export const IsoBuild: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const layers = prop<string[]>(beat, "layers", ["Idea", "Script", "Voice", "Motion", "Audience"]);
  const n = layers.length;
  const step = Math.max(6, Math.floor((beat.frames * 0.7) / Math.max(1, n)));
  const cx = 470, base = 1180, bw = 250, bh = 110;
  const block = (y: number, lit: boolean, w: number) => {
    const top = `${cx},${y - w * 0.5} ${cx + w},${y} ${cx},${y + w * 0.5} ${cx - w},${y}`;
    const left = `${cx - w},${y} ${cx},${y + w * 0.5} ${cx},${y + w * 0.5 + bh} ${cx - w},${y + bh}`;
    const right = `${cx + w},${y} ${cx},${y + w * 0.5} ${cx},${y + w * 0.5 + bh} ${cx + w},${y + bh}`;
    return (
      <>
        <polygon points={left} fill={lit ? theme.accent : alpha(theme.ink, 0.16)} />
        <polygon points={right} fill={lit ? alpha(theme.accent, 0.7) : alpha(theme.ink, 0.1)} />
        <polygon points={top} fill={lit ? theme.accent2 : alpha(theme.ink, 0.24)} stroke={alpha(theme.ink, 0.3)} strokeWidth={2} />
      </>
    );
  };
  const current = Math.min(n - 1, Math.floor(Math.max(0, frame - 4) / step));
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <ellipse cx={cx} cy={base + bh + 140} rx={360} ry={90} fill={alpha(theme.accent, 0.12)} style={{ filter: "blur(20px)" }} />
        {layers.map((l, i) => {
          const at = 4 + i * step;
          if (frame < at) return null;
          const s = pop(frame, fps, at, "slam");
          const y = base - i * bh - (1 - s) * 700;
          const w = bw - i * 14;
          return (
            <g key={i} opacity={Math.min(1, s * 2)}>
              {block(y, i === current, w)}
              <line x1={cx + w + 20} y1={y + bh / 2} x2={cx + w + 80} y2={y + bh / 2} stroke={alpha(theme.ink, 0.4)} strokeWidth={3} />
              <text x={cx + w + 96} y={y + bh / 2 + 16} fill={i === current ? theme.accent : theme.ink} fontFamily={theme.body} fontWeight={900} fontSize={46}>{l}</text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── DOT WAVE ───────────────────────────
 * A 3D terrain of dots rolls like an ocean under the word (perspective-projected). Data/AI vibe. */
export const DotWave: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const word = prop(beat, "word", beat.text);
  const cols = 34, rows = 26;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x3 = (c - cols / 2) * 70;
      const z3 = 200 + r * 70;
      const h = (Math.sin(c * 0.35 + frame * 0.08) + Math.cos(r * 0.3 + frame * 0.06) + noise2D(`w${seed}`, c * 0.15, r * 0.15 + frame * 0.01) * 1.4) * 60;
      const f = 900 / z3;
      const x = W / 2 + x3 * f;
      const y = 1010 + (170 - h) * f * 0.55; // camera above the surface, horizon at ~1000px
      if (x < -20 || x > W + 20) continue;
      const near = 1 - r / rows;
      dots.push(<circle key={`${r}-${c}`} cx={x} cy={y} r={Math.max(1.2, 5 * f * 0.55)} fill={h > 60 ? theme.accent : theme.ink} opacity={0.15 + near * 0.6} />);
    }
  }
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>{dots}</svg>
      <Hero text={word} theme={theme} s={easeOut(frame, 4, 12)} y={-260} />
    </AbsoluteFill>
  );
};

/* ─────────────────────────── PRISM ───────────────────────────
 * Real 3D cube; each face carries a word; it snaps a quarter-turn on every emphasis/spoken cue. */
export const Prism: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const faces = prop<string[]>(beat, "faces", beat.text.replace(/[.,!?]/g, "").split(/\s+/).filter((w) => w.length > 2).slice(0, 4));
  const n = Math.max(1, faces.length);
  const seg = Math.max(8, Math.floor((beat.frames - 6) / n));
  let rot = 0;
  for (let i = 1; i < n; i++) rot += pop(frame, fps, i * seg, "snap") * 90;
  const S = 560;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 2200 }}>
      <div style={{ width: S, height: S, position: "relative", transformStyle: "preserve-3d", transform: `translateY(-80px) rotateX(-14deg) rotateY(${-rot + Math.sin(frame / 30) * 6}deg)` }}>
        {faces.map((f, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, transform: `rotateY(${i * 90}deg) translateZ(${S / 2}px)`, background: i % 2 ? theme.accent : theme.surface, border: `4px solid ${alpha(theme.ink, 0.15)}`, display: "flex", alignItems: "center", justifyContent: "center", backfaceVisibility: "hidden", fontFamily: theme.display, fontWeight: 900, fontSize: fitSize([f], 480, 130, 60, 0.6), color: i % 2 ? theme.onAccent : theme.ink, textTransform: "uppercase", boxShadow: `inset 0 0 120px ${alpha("#000000", 0.35)}` }}>{f}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── AURORA TYPE ───────────────────────────
 * Giant type filled with a moving aurora gradient, over drifting light ribbons. Premium poster look. */
export const AuroraType: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const words = localWords(beat);
  const text = prop(beat, "word", "");
  const shown = text || words.filter((w) => w.at <= frame + 2).map((w) => w.w).join(" ");
  const size = fitSize((text || beat.text).split(/\s+/), 940, 190, 90, 0.56);
  const gx = 50 + noise2D(`ax${seed}`, frame / 80, 0) * 40;
  const gy = 50 + noise2D(`ay${seed}`, frame / 80, 1) * 40;
  const grad = `radial-gradient(60% 60% at ${gx}% ${gy}%, #FFFFFF, ${theme.accent2} 25%, ${theme.accent} 70%, ${theme.accent} 100%)`;
  return (
    <AbsoluteFill>
      {[0, 1, 2].map((k) => (
        <AbsoluteFill key={k} style={{ background: `linear-gradient(${100 + k * 25 + noise2D(`r${k}${seed}`, frame / 120, k) * 30}deg, transparent 40%, ${alpha(k === 1 ? theme.accent2 : theme.accent, 0.22)} 50%, transparent 60%)`, filter: "blur(40px)", transform: `translateY(${noise2D(`t${k}${seed}`, frame / 100, k) * 200}px)` }} />
      ))}
      <Safe>
        <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: size, lineHeight: 0.92, textAlign: "center", textTransform: "uppercase", backgroundImage: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", maxWidth: 960, filter: `drop-shadow(0 0 30px ${alpha(theme.accent, 0.35)})`, opacity: easeOut(frame, 0, 6) }}>{shown}</div>
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── NEURAL NET ───────────────────────────
 * Layers of nodes wired together; signal pulses fire forward through the edges to an output label. AI beats. */
export const NeuralNet: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const output = prop(beat, "output", beat.text);
  const inputs = prop<string[]>(beat, "inputs", []);
  const layers = [Math.max(3, inputs.length || 4), 6, 6, 3, 1];
  const x0 = inputs.length ? 270 : 140, x1 = 940, yTop = 520, yBot = 1340;
  const nodes = layers.map((n, li) => Array.from({ length: n }, (_, k) => ({ x: x0 + (li / (layers.length - 1)) * (x1 - x0), y: yTop + ((k + 0.5) / n) * (yBot - yTop), li, k })));
  const edges: React.ReactNode[] = [];
  const pulses: React.ReactNode[] = [];
  const wave = (frame * 0.06) % (layers.length + 1);
  nodes.slice(0, -1).forEach((col, li) => col.forEach((a) => nodes[li + 1].forEach((b, bi) => {
    const w = hash01(a.k, b.k, li, seed);
    edges.push(<line key={`e${li}-${a.k}-${bi}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={w > 0.6 ? theme.accent : theme.ink} strokeOpacity={w > 0.6 ? 0.35 : 0.08} strokeWidth={w > 0.6 ? 2.5 : 1.5} />);
    const t = wave - li;
    if (t > 0 && t < 1 && w > 0.55) pulses.push(<circle key={`p${li}-${a.k}-${bi}`} cx={a.x + (b.x - a.x) * t} cy={a.y + (b.y - a.y) * t} r={7} fill={theme.ink} style={{ filter: `drop-shadow(0 0 8px ${theme.accent})` }} />);
  })));
  const fired = (li: number) => interpolate(wave - li, [-0.2, 0, 0.6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = nodes[nodes.length - 1][0];
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: easeOut(frame, 0, 8) }}>
        {edges}{pulses}
        {nodes.flat().map((n) => <circle key={`n${n.li}-${n.k}`} cx={n.x} cy={n.y} r={n.li === layers.length - 1 ? 30 : 16} fill={theme.bg} stroke={theme.accent} strokeWidth={4} style={{ filter: fired(n.li) > 0.1 ? `drop-shadow(0 0 ${fired(n.li) * 20}px ${theme.accent})` : "none" }} />)}
        {inputs.map((t, k) => <text key={k} x={x0 - 30} y={nodes[0][k]?.y + 10} textAnchor="end" fill={theme.dim} fontFamily={theme.mono} fontSize={34} fontWeight={700}>{t}</text>)}
      </svg>
      <div style={{ position: "absolute", left: 120, right: 120, top: out.y + 70, textAlign: "center", fontFamily: theme.body, fontWeight: 900, fontSize: 64, color: theme.ink, opacity: easeOut(frame, beat.frames * 0.35, 10) }}>{output}</div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── CODE RAIN ───────────────────────────
 * Columns of glyphs fall; the word resolves out of the rain in accent. Hacker/AI intros. */
export const CodeRain: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const word = prop(beat, "word", beat.text);
  const cols = 22, rowsN = 34, cw = W / cols, ch = H / rowsN;
  const G = "01アイウエオカキクケコ$#%&*+<>{}[]ABCDEF";
  const out: React.ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    const speed = 0.35 + hash01(c, seed) * 0.6;
    const head = ((frame * speed + hash01(c, seed, 3) * rowsN) % (rowsN + 12));
    for (let r = 0; r < rowsN; r++) {
      const d = head - r;
      if (d < 0 || d > 12) continue;
      const g = G[Math.floor(hash01(c, r, Math.floor(frame / 3)) * G.length)];
      out.push(<text key={`${c}-${r}`} x={c * cw + cw / 2} y={r * ch + ch} textAnchor="middle" fontFamily={theme.mono} fontSize={38} fontWeight={700} fill={d < 1 ? "#FFFFFF" : theme.accent} opacity={Math.max(0, 1 - d / 12) * 0.85}>{g}</text>);
    }
  }
  const s = pop(frame, fps, Math.floor(beat.frames * 0.3), "slam");
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: interpolate(s, [0, 1], [1, 0.45]) }}>{out}</svg>
      <Hero text={word} theme={theme} s={frame >= beat.frames * 0.3 ? s : 0} />
    </AbsoluteFill>
  );
};

/* ─────────────────────────── RADAR ───────────────────────────
 * Radar sweep scans; blips appear as the beam passes, each tagged. "Finding opportunities", markets. */
export const Radar: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const items = prop<string[]>(beat, "items", ["AI tools", "Creators", "Brands", "Founders"]);
  const label = prop(beat, "label", "");
  const cx = W / 2, cy = 880, R = 420;
  const DEG = 7; // beam speed (deg/frame), clockwise from 12 o'clock
  const sweep = (frame * DEG) % 360;
  const gap = Math.max(5, Math.floor((beat.frames * 0.7) / Math.max(1, items.length)));
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {[1, 0.75, 0.5, 0.25].map((k) => <circle key={k} cx={cx} cy={cy} r={R * k} fill="none" stroke={alpha(theme.accent, 0.3)} strokeWidth={2} />)}
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke={alpha(theme.accent, 0.2)} strokeWidth={2} />
        <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke={alpha(theme.accent, 0.2)} strokeWidth={2} />
      </svg>
      <div style={{ position: "absolute", left: cx - R, top: cy - R, width: R * 2, height: R * 2, borderRadius: "50%", background: `conic-gradient(from ${sweep - 55}deg, transparent 0deg, ${alpha(theme.accent, 0.6)} 55deg, transparent 55.5deg)` }} />
      {items.map((it, i) => {
        const hit = 6 + i * gap;
        const since = frame - hit;
        if (since < 0) return null;
        const th = ((hit * DEG) % 360) * (Math.PI / 180); // where the beam was at hit time
        const rr = R * (0.3 + hash01(i, seed, 2) * 0.6);
        const x = cx + Math.sin(th) * rr;
        const y = cy - Math.cos(th) * rr;
        const o = easeOut(since, 0, 4);
        return (
          <div key={i} style={{ position: "absolute", left: x - 14, top: y - 14, opacity: o }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: theme.ink, boxShadow: `0 0 0 ${8 + (since % 20)}px ${alpha(theme.accent, Math.max(0, 0.4 - (since % 20) / 50))}` }} />
            <div style={{ position: "absolute", left: 40, top: -14, whiteSpace: "nowrap", padding: "6px 16px", borderRadius: 10, background: alpha(theme.bg, 0.85), border: `2px solid ${theme.accent}`, fontFamily: theme.mono, fontWeight: 700, fontSize: 30, color: theme.ink }}>{it}</div>
          </div>
        );
      })}
      {label ? <Hero text={label} theme={theme} s={easeOut(frame, 8, 10)} y={-620} max={100} /> : null}
    </AbsoluteFill>
  );
};
