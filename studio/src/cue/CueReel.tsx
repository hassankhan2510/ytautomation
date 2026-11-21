import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * CUE renderer — draws a compiled PLAN and nothing else. Every position, size, line break, entrance,
 * exit, pulse and count-up was solved by the compiler (studio/vc); this file only plays the tracks back.
 * Fonts are the SAME .ttf files the compiler measured with, so text lands exactly where it was solved.
 */

type Track = { ty: number[]; sc: number[]; op: number[]; bl: number[] };
type Unit = {
  box: number; kind: string; feel: string; text: string; x: number; y: number; w: number;
  fontSize: number; lineHeight: number; color: string; accent?: boolean; mask?: boolean;
  font: { family: string; weight: number; file: string; tracking: number; upper: boolean };
  line?: { x: number; y: number; w: number; h: number };
  lines?: { text: string; x: number; y: number }[];
  f0: number; enter: Track;
  exit: { f0: number; dur: number; op: number[]; ty: number[]; bl: number[] };
  pulse?: { f0: number; sc: number[] };
  count?: { f0?: number; prefix: string; suffix: string; decimals: number; values: number[] };
  dim?: number; lit?: { f0: number; pop: number[] };
  chip?: { x: number; size: number; label: string };
};
type Scene = { id: string; start: number; end: number; camera: { from: number; to: number }; units: Unit[] };
export type CuePlan = {
  duration: number; fps: number; style: string; colors: Record<string, string>;
  audio?: { from: number; to: number; at: number }[];
  captions?: { w: string; start: number; end: number }[];
  aspects: Record<string, { canvas: { w: number; h: number }; scenes: Scene[] }>;
  music?: { src: string; step: number; gain: number[]; loop: boolean };
};
export type CueProps = { plan: CuePlan; aspect: string; audio?: string; captions?: boolean };

const FONT_FILES = ["SpaceGrotesk-700", "InterTight-500", "InterTight-700", "InterTight-800", "Unbounded-900"];
const fam = (file: string) => `cue-${file}`;

function useCueFonts() {
  const [handle] = useState(() => delayRender("CUE fonts"));
  useEffect(() => {
    Promise.all(FONT_FILES.map((f) => new FontFace(fam(f), `url(${staticFile(`cue/fonts/${f}.ttf`)})`).load().then((ff) => document.fonts.add(ff))))
      .then(() => continueRender(handle))
      .catch((e) => { console.error(e); continueRender(handle); });
  }, [handle]);
}

const at = (arr: number[], i: number, rest: number) => (i < 0 ? arr[0] ?? rest : i < arr.length ? arr[i] : rest);
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function unitState(u: Unit, f: number) {
  if (f < u.f0) return null;
  const i = f - u.f0;
  let ty = at(u.enter.ty, i, 0), sc = at(u.enter.sc, i, 1), op = at(u.enter.op, i, 1), bl = at(u.enter.bl, i, 0);
  if (i >= u.enter.ty.length) { ty = 0; sc = 1; op = 1; bl = 0; }
  if (f >= u.exit.f0) {
    if (!u.exit.dur) return null;
    const k = f - u.exit.f0;
    if (k >= u.exit.op.length) return null;
    op *= u.exit.op[k]; ty += u.exit.ty[k]; bl += u.exit.bl[k];
  }
  if (u.pulse && f >= u.pulse.f0 && f < u.pulse.f0 + u.pulse.sc.length) sc *= u.pulse.sc[f - u.pulse.f0];
  let lit = 1;
  if (u.dim != null && u.lit) {
    const k = f - u.lit.f0;
    lit = k < 0 ? u.dim : Math.min(1, u.dim + (1 - u.dim) * ((k + 1) / 4));
    if (k >= 0 && k < u.lit.pop.length) sc *= u.lit.pop[k];
    op *= lit;
  }
  return { ty, sc, op, bl, i, lit };
}

const Background: React.FC<{ c: Record<string, string>; w: number; h: number }> = ({ c, w, h }) => {
  const f = useCurrentFrame();
  const gx = 50 + 18 * Math.sin(f / 140), gy = 34 + 10 * Math.cos(f / 170);
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 45% at ${gx}% ${gy}%, ${c.glow}55 0%, ${c.bg2}88 45%, transparent 75%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 120% 60% at 50% 120%, ${c.bg2} 0%, transparent 60%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${70 - 20 * Math.sin(f / 210)}% ${78 + 6 * Math.sin(f / 160)}%, ${c.glow}26 0%, transparent 38%)` }} />
      <AbsoluteFill style={{ opacity: 0.05, backgroundImage: `linear-gradient(${c.ink} 1px, transparent 1px), linear-gradient(90deg, ${c.ink} 1px, transparent 1px)`, backgroundSize: `${w / 12}px ${w / 12}px`, backgroundPosition: `0 ${(f * 0.4) % (w / 12)}px`, maskImage: "radial-gradient(ellipse 70% 55% at 50% 45%, black 20%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 45%, black 20%, transparent 75%)" }} />
      <AbsoluteFill style={{ boxShadow: `inset 0 0 ${Math.round(w * 0.28)}px ${Math.round(w * 0.06)}px rgba(0,0,0,0.85)` }} />
      <svg width={w} height={h} style={{ position: "absolute", opacity: 0.07, mixBlendMode: "screen" }}>
        <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 7} /></filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

const UnitView: React.FC<{ u: Unit; f: number; c: Record<string, string> }> = ({ u, f, c }) => {
  const s = unitState(u, f);
  if (!s) return null;
  const lh = u.fontSize * u.lineHeight;
  const color = u.accent ? c.accentHi : c[u.color] || c.ink;
  const txt = (t: string) => (u.font.upper ? t.toUpperCase() : t);
  const textStyle: React.CSSProperties = {
    fontFamily: fam(u.font.file), fontWeight: u.font.weight, fontSize: u.fontSize, lineHeight: `${lh}px`,
    letterSpacing: `${u.font.tracking}em`, whiteSpace: "pre", color, fontKerning: "normal",
  };
  if (u.kind === "stat") Object.assign(textStyle, { backgroundImage: `linear-gradient(180deg, ${c.accentHi} 0%, ${c.accent} 70%)`, WebkitBackgroundClip: "text", color: "transparent", filter: `drop-shadow(0 0 ${u.fontSize * 0.12}px ${c.glow}88)` });
  if (u.accent) textStyle.textShadow = `0 0 ${u.fontSize * 0.25}px ${c.glow}aa`;
  const tf = (ox: number, oy: number): React.CSSProperties => ({
    transform: `translateY(${s.ty}px) scale(${s.sc})`, transformOrigin: `${ox}px ${oy}px`, opacity: s.op,
    filter: [s.bl > 0.05 ? `blur(${s.bl}px)` : "", textStyle.filter || ""].join(" ").trim() || undefined,
  });
  if (u.lines) {
    // a block: stat / kicker / label / item / by — text may count up
    let shown = u.text;
    if (u.count) { const k = f - (u.count.f0 ?? u.f0); shown = k < 0 ? `${u.count.prefix}${(0).toFixed(u.count.decimals)}${u.count.suffix}` : k < u.count.values.length ? `${u.count.prefix}${u.count.values[k].toFixed(u.count.decimals)}${u.count.suffix}` : u.text; }
    const chip = u.chip ? (
      <div style={{ position: "absolute", left: u.chip.x - u.x, top: (lh - u.chip.size) / 2, width: u.chip.size, height: u.chip.size, borderRadius: u.chip.size * 0.18,
        background: c.accent, color: c.ink, fontFamily: fam("Unbounded-900"), fontWeight: 900, fontSize: u.chip.size * 0.42, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 ${u.chip.size * 0.5}px ${c.glow}55` }}>{u.chip.label}</div>
    ) : null;
    const kickerLine = u.kind === "kicker" ? (
      <div style={{ position: "absolute", left: -u.fontSize * 1.6, top: lh * 0.48, width: u.fontSize * 1.1, height: Math.max(3, u.fontSize * 0.09), background: c.accent, borderRadius: 2,
        transform: `scaleX(${ease(s.i / 9)})`, transformOrigin: "right center" }} />
    ) : null;
    return (
      <div style={{ position: "absolute", left: u.x, top: u.y, width: u.w, ...tf(u.w / 2, (u.lines.length * lh) / 2) }}>
        {chip}{kickerLine}
        {u.lines.map((l, i) => (
          <div key={i} style={{ ...textStyle, filter: undefined, position: "absolute", left: u.count ? 0 : l.x, top: l.y, width: u.count ? u.w : undefined, textAlign: u.count ? "center" : undefined }}>
            {txt(u.count && i === 0 ? shown : l.text)}
          </div>
        ))}
      </div>
    );
  }
  // emphasis: a crimson marker sweeps in BEHIND the word (exact width from the compiler's font engine)
  const hitF = u.pulse ? u.pulse.f0 + 4 : u.lit ? u.lit.f0 : u.f0 + u.enter.ty.length;
  const sweep = u.accent ? ease((f - hitF) / 7) : 0;
  const marker = u.accent && sweep > 0 ? (
    <div style={{ position: "absolute", left: -u.fontSize * 0.08, top: lh * 0.14, height: lh * 0.78, width: (u.w + u.fontSize * 0.16) * sweep,
      background: c.accent, borderRadius: u.fontSize * 0.06, boxShadow: `0 0 ${u.fontSize * 0.4}px ${c.glow}66` }} />
  ) : null;
  if (u.accent && sweep > 0) { textStyle.color = c.ink; textStyle.textShadow = "none"; }
  const word = <div style={{ position: "absolute", left: 0, top: 0, ...tf(u.w / 2, lh / 2) }}>{marker}<div style={{ ...textStyle, position: "relative" }}>{txt(u.text)}</div></div>;
  if (u.mask && u.line) {
    const pad = u.fontSize * 0.28;
    return (
      <div style={{ position: "absolute", left: u.x - pad, top: u.line.y - pad * 0.4, width: u.w + pad * 2, height: u.line.h + pad * 1.2, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: pad, top: pad * 0.4 }}>{word}</div>
      </div>
    );
  }
  return <div style={{ position: "absolute", left: u.x, top: u.y }}>{word}</div>;
};

const Captions: React.FC<{ words: { w: string; start: number; end: number }[]; t: number; c: Record<string, string>; w: number; h: number }> = ({ words, t, c, w, h }) => {
  const i = words.findIndex((x) => x.end >= t);
  if (i < 0 || words[i].start > t + 0.25) return null;
  const a = Math.max(0, i - (i % 4)), group = words.slice(a, a + 4);
  return (
    <div style={{ position: "absolute", left: 0, width: w, top: h * 0.81, textAlign: "center", fontFamily: fam("InterTight-800"), fontWeight: 800, fontSize: w * 0.052, letterSpacing: "-0.01em" }}>
      {group.map((x, k) => (
        <span key={k} style={{ color: a + k === i ? c.ink : `${c.ink}77`, padding: "0.04em 0.22em", margin: "0 0.04em", borderRadius: "0.22em", background: a + k === i ? c.accent : "transparent", boxShadow: a + k === i ? `0 0 22px ${c.glow}88` : "none" }}>{x.w}</span>
      ))}
    </div>
  );
};

export const CueReel: React.FC<CueProps> = ({ plan, aspect, audio, captions = true }) => {
  useCueFonts();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const A = plan.aspects[aspect] || Object.values(plan.aspects)[0];
  const { w, h } = A.canvas;
  const t = f / fps;
  const sc = A.scenes.find((s) => t >= s.start && t < s.end) || A.scenes[A.scenes.length - 1];
  const u = ease((t - sc.start) / Math.max(0.01, sc.end - sc.start));
  const snap = 1 + 0.045 * (1 - ease((t - sc.start) / 0.28));                 // punch-in on every cut
  const cam = (sc.camera.from + (sc.camera.to - sc.camera.from) * u) * snap;
  return (
    <AbsoluteFill>
      <Background c={plan.colors} w={w} h={h} />
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: "50% 42%" }}>
        {sc.units.map((x, k) => <UnitView key={k} u={x} f={f} c={plan.colors} />)}
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: 0, height: Math.max(6, h * 0.004), width: `${Math.min(100, (t / plan.duration) * 100)}%`, background: `linear-gradient(90deg, ${plan.colors.accent}, ${plan.colors.accentHi})`, boxShadow: `0 0 12px ${plan.colors.glow}` }} />
      {captions && plan.captions ? <Captions words={plan.captions} t={t} c={plan.colors} w={w} h={h} /> : null}
      {plan.music ? (
        <Audio src={staticFile(plan.music.src)} loop={plan.music.loop}
          volume={(fr) => { const m = plan.music!; const x = fr / fps / m.step, i = Math.floor(x); const a = m.gain[Math.min(i, m.gain.length - 1)] ?? 0.3, b = m.gain[Math.min(i + 1, m.gain.length - 1)] ?? a; return a + (b - a) * (x - i); }} />
      ) : null}
      {audio && plan.audio ? plan.audio.map((s, k) => (
        <Sequence key={k} from={Math.round(s.at * fps)} durationInFrames={Math.max(1, Math.round((s.to - s.from) * fps))}>
          <Audio src={staticFile(audio)} startFrom={Math.round(s.from * fps)} />
        </Sequence>
      )) : null}
    </AbsoluteFill>
  );
};
