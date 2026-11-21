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
  count?: { prefix: string; suffix: string; decimals: number; values: number[] };
};
type Scene = { id: string; start: number; end: number; camera: { from: number; to: number }; units: Unit[] };
export type CuePlan = {
  duration: number; fps: number; style: string; colors: Record<string, string>;
  audio?: { from: number; to: number; at: number }[];
  captions?: { w: string; start: number; end: number }[];
  aspects: Record<string, { canvas: { w: number; h: number }; scenes: Scene[] }>;
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
  return { ty, sc, op, bl, i };
}

const Background: React.FC<{ c: Record<string, string>; w: number; h: number }> = ({ c, w, h }) => {
  const f = useCurrentFrame();
  const gx = 50 + 18 * Math.sin(f / 140), gy = 34 + 10 * Math.cos(f / 170);
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 45% at ${gx}% ${gy}%, ${c.glow}55 0%, ${c.bg2}88 45%, transparent 75%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 120% 60% at 50% 120%, ${c.bg2} 0%, transparent 60%)` }} />
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
    if (u.count) { const k = f - u.f0; shown = k < u.count.values.length ? `${u.count.prefix}${u.count.values[Math.max(0, k)].toFixed(u.count.decimals)}${u.count.suffix}` : u.text; }
    return (
      <div style={{ position: "absolute", left: u.x, top: u.y, width: u.w, ...tf(u.w / 2, (u.lines.length * lh) / 2) }}>
        {u.lines.map((l, i) => (
          <div key={i} style={{ ...textStyle, filter: undefined, position: "absolute", left: u.count ? 0 : l.x, top: l.y, width: u.count ? u.w : undefined, textAlign: u.count ? "center" : undefined }}>
            {txt(u.count && i === 0 ? shown : l.text)}
          </div>
        ))}
      </div>
    );
  }
  const word = <div style={{ ...textStyle, position: "absolute", left: 0, top: 0, ...tf(u.w / 2, lh / 2) }}>{txt(u.text)}</div>;
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
        <span key={k} style={{ color: a + k === i ? c.ink : `${c.ink}66`, padding: "0 0.18em", textShadow: a + k === i ? `0 0 18px ${c.glow}` : "none" }}>{x.w}</span>
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
  const cam = sc.camera.from + (sc.camera.to - sc.camera.from) * u;
  return (
    <AbsoluteFill>
      <Background c={plan.colors} w={w} h={h} />
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: "50% 42%" }}>
        {sc.units.map((x, k) => <UnitView key={k} u={x} f={f} c={plan.colors} />)}
      </AbsoluteFill>
      {captions && plan.captions ? <Captions words={plan.captions} t={t} c={plan.colors} w={w} h={h} /> : null}
      {audio && plan.audio ? plan.audio.map((s, k) => (
        <Sequence key={k} from={Math.round(s.at * fps)} durationInFrames={Math.max(1, Math.round((s.to - s.from) * fps))}>
          <Audio src={staticFile(audio)} startFrom={Math.round(s.from * fps)} />
        </Sequence>
      )) : null}
    </AbsoluteFill>
  );
};
