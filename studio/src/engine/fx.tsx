import React from "react";
import { AbsoluteFill, HtmlInCanvas, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { EffectsProp } from "remotion";
import { noise2D } from "@remotion/noise";
import { alpha } from "./theme";
import { drift, pop } from "./motion";
import { useRender } from "./render-context";
import type { Rng } from "./rng";
import type { TimedBeat } from "./types";

/**
 * GPU effect stack on ANY layer (HTML-in-Canvas + @remotion/effects) — After-Effects-style. If the
 * renderer can't do HTML-in-Canvas, the children render plain with an optional CSS approximation,
 * so a render never breaks.
 */
export const ShaderFx: React.FC<{ effects: EffectsProp; fallback?: React.CSSProperties; children: React.ReactNode }> = ({ effects, fallback, children }) => {
  const { width, height } = useVideoConfig();
  const { shaders } = useRender();
  if (!shaders || effects.length === 0) return <AbsoluteFill style={fallback}>{children}</AbsoluteFill>;
  return <HtmlInCanvas width={width} height={height} effects={effects}>{children}</HtmlInCanvas>;
};

/**
 * CAMERA RIG — wraps every beat:
 *  · punch-in on the cut (stronger on hype beats),
 *  · slow continuous push (no dead frames),
 *  · noise-driven handheld SHAKE that fires on each emphasis word and decays.
 */
export const CameraRig: React.FC<{ beat: TimedBeat; rng: Rng; children: React.ReactNode }> = ({ beat, rng, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = beat.energy;
  const punch = pop(frame, fps, 0, "slam");
  const startScale = 1 + 0.035 * e;
  const tilt = rng.sign() * rng.range(0.2, 0.7) * (e - 1);
  let sx = 0, sy = 0, rot = 0;
  for (const w of beat.words) {
    if (!w.emphasis) continue;
    const t = frame - (w.from - beat.from);
    if (t < 0 || t > 14) continue;
    const amp = (1 - t / 14) * (5 + 5 * e);
    sx += noise2D(`x${w.from}`, t * 0.55, 0) * amp;
    sy += noise2D(`y${w.from}`, t * 0.55, 3) * amp;
    rot += noise2D(`r${w.from}`, t * 0.45, 7) * amp * 0.07;
  }
  const scale = interpolate(punch, [0, 1], [startScale, 1]) * drift(frame, beat.frames, 0.025 + 0.01 * e);
  const settleTilt = interpolate(punch, [0, 1], [tilt, 0]);
  return (
    <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${scale}) rotate(${rot + settleTilt}deg)` }}>{children}</AbsoluteFill>
  );
};

export type BackdropKind = "grid" | "dots" | "glow" | "rays" | "lines";
export const BACKDROPS: BackdropKind[] = ["grid", "dots", "glow", "rays", "lines"];

/** Living backgrounds — never a flat fill. Each slowly moves so held shots still feel alive. */
export const Backdrop: React.FC<{ kind: BackdropKind; seed: number }> = ({ kind, seed }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { theme } = useRender();
  const base = (
    <AbsoluteFill style={{ background: `radial-gradient(130% 90% at 50% 18%, ${theme.bg2} 0%, ${theme.bg} 62%)` }} />
  );
  const a = theme.dark ? 0.11 : 0.09;
  let layer: React.ReactNode = null;
  if (kind === "grid") {
    // Perspective "floor" grid rushing toward camera — the tech-edit staple.
    const off = (frame * 2.4) % 80;
    layer = (
      <AbsoluteFill style={{ perspective: 900, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -width, right: -width, top: height * 0.45, height: height * 1.4, transform: "rotateX(72deg)", transformOrigin: "50% 0%", backgroundImage: `linear-gradient(${alpha(theme.accent, a * 2.2)} 2px, transparent 2px), linear-gradient(90deg, ${alpha(theme.accent, a * 2.2)} 2px, transparent 2px)`, backgroundSize: "80px 80px", backgroundPosition: `0 ${off}px`, maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)" }} />
      </AbsoluteFill>
    );
  } else if (kind === "dots") {
    layer = <AbsoluteFill style={{ backgroundImage: `radial-gradient(${alpha(theme.ink, a)} 2px, transparent 2.5px)`, backgroundSize: "38px 38px", backgroundPosition: `${frame * 0.4}px ${frame * 0.25}px`, maskImage: "radial-gradient(circle at 50% 45%, black 25%, transparent 75%)" }} />;
  } else if (kind === "glow") {
    const x1 = 50 + noise2D(`g1${seed}`, frame / 120, 0) * 22;
    const y1 = 35 + noise2D(`g2${seed}`, frame / 120, 1) * 14;
    const x2 = 50 + noise2D(`g3${seed}`, frame / 140, 2) * 26;
    layer = (
      <AbsoluteFill style={{ background: `radial-gradient(40% 28% at ${x1}% ${y1}%, ${alpha(theme.accent, theme.dark ? 0.32 : 0.22)}, transparent 70%), radial-gradient(36% 24% at ${x2}% 72%, ${alpha(theme.accent2, theme.dark ? 0.16 : 0.12)}, transparent 70%)`, filter: "blur(10px)" }} />
    );
  } else if (kind === "rays") {
    layer = <AbsoluteFill style={{ background: `repeating-conic-gradient(from ${frame * 0.25}deg at 50% 42%, ${alpha(theme.accent, a)} 0deg 6deg, transparent 6deg 18deg)`, maskImage: "radial-gradient(circle at 50% 42%, black 10%, transparent 70%)" }} />;
  } else {
    layer = <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(-35deg, ${alpha(theme.ink, a * 0.7)} 0 2px, transparent 2px 46px)`, backgroundPosition: `${frame * 0.8}px 0` }} />;
  }
  return (<AbsoluteFill>{base}{layer}</AbsoluteFill>);
};

/** Analog film grain — kills the "digital/AI" sheen. Seed changes every 2 frames (real grain flicker). */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.08 }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 97;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity }}>
      <svg width="100%" height="100%">
        <filter id={`grain${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(120% 80% at 50% 45%, transparent 55%, rgba(0,0,0,${strength}) 100%)` }} />
);

/** Drifting light leak — warm cinematic flare, screen-blended. */
export const LightLeak: React.FC<{ seed: number }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  if (!theme.dark) return null;
  const x = 20 + (noise2D(`lx${seed}`, frame / 160, 0) + 1) * 30;
  const y = 10 + (noise2D(`ly${seed}`, frame / 180, 1) + 1) * 20;
  const o = 0.12 + (noise2D(`lo${seed}`, frame / 90, 2) + 1) * 0.06;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: o, background: `radial-gradient(28% 22% at ${x}% ${y}%, ${alpha(theme.accent, 0.9)}, transparent 70%), radial-gradient(22% 30% at ${100 - x}% ${100 - y}%, rgba(255,170,90,0.55), transparent 70%)`, filter: "blur(30px)" }} />
  );
};

/** Retention bar along the top — viewers stay to "finish the bar". */
export const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { theme } = useRender();
  const w = interpolate(frame, [0, durationInFrames - 1], [0, 100], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 7, background: alpha(theme.ink, 0.12) }}>
      <div style={{ width: `${w}%`, height: "100%", background: theme.accent, boxShadow: `0 0 14px ${theme.accent}` }} />
    </div>
  );
};
