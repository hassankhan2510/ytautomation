import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { cube } from "@remotion/transitions/cube";
import { pushCut } from "@remotion/transitions/push-cut";
import { fade } from "@remotion/transitions/fade";
import { zoomBlur } from "@remotion/transitions/zoom-blur";
import { filmBurn } from "@remotion/transitions/film-burn";
import { crosswarp } from "@remotion/transitions/crosswarp";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { dreamyZoom } from "@remotion/transitions/dreamy-zoom";
import { ripple } from "@remotion/transitions/ripple";
import { swap } from "@remotion/transitions/swap";
import { blurSlide } from "@remotion/transitions/blur-slide";
import type { Rng } from "./rng";
import type { TimedBeat } from "./types";

type P = Record<string, unknown>;
type Comp = React.FC<TransitionPresentationComponentProps<P>>;
const make = (component: Comp): TransitionPresentation<P> => ({ component, props: {} });

/* ---------------- Custom CSS transitions (render anywhere, CPU-cheap) ---------------- */

/** Punch-in: the new shot slams in from a zoom with a blur, the old one is sucked away. */
const ZoomPunch: Comp = ({ children, presentationDirection: dir, presentationProgress: p }) => {
  const enter = dir === "entering";
  const scale = enter ? interpolate(p, [0, 1], [1.45, 1]) : interpolate(p, [0, 1], [1, 0.82]);
  const blur = enter ? (1 - p) * 14 : p * 10;
  return <AbsoluteFill style={{ transform: `scale(${scale})`, opacity: enter ? Math.min(1, p * 1.6) : 1 - p, filter: `blur(${blur}px)` }}>{children}</AbsoluteFill>;
};

/** Whip-pan: a fast horizontal throw with directional smear (skew + blur). */
const Whip: Comp = ({ children, presentationDirection: dir, presentationProgress: p }) => {
  const enter = dir === "entering";
  const x = enter ? interpolate(p, [0, 1], [100, 0]) : interpolate(p, [0, 1], [0, -100]);
  const smear = Math.sin(p * Math.PI);
  return <AbsoluteFill style={{ transform: `translateX(${x}%) skewX(${-smear * 12}deg) scaleX(${1 + smear * 0.18})`, filter: `blur(${smear * 9}px)` }}>{children}</AbsoluteFill>;
};

/** Glitch: stepped jitter + RGB channel split, then snap clean. */
const Glitch: Comp = ({ children, presentationDirection: dir, presentationProgress: p }) => {
  const enter = dir === "entering";
  const step = Math.floor(p * 6);
  const k = Math.sin(step * 12.9898) * 43758.5453;
  const j = (k - Math.floor(k) - 0.5) * 2;
  const amt = Math.sin(p * Math.PI) * 14;
  const visible = enter ? p > 0.35 : p < 0.65;
  return (
    <AbsoluteFill style={{ opacity: visible ? 1 : 0, transform: `translateX(${j * amt}px)`, filter: `drop-shadow(${-amt * 0.6}px 0 rgba(255,0,60,0.85)) drop-shadow(${amt * 0.6}px 0 rgba(0,230,255,0.85))` }}>
      {children}
    </AbsoluteFill>
  );
};

/** Flash: white-out on the cut — the classic beat-drop hit. */
const Flash: Comp = ({ children, presentationDirection: dir, presentationProgress: p }) => {
  const enter = dir === "entering";
  const white = enter ? 1 - p : p;
  return (
    <AbsoluteFill style={{ opacity: enter ? (p > 0.5 ? 1 : 0) : p < 0.5 ? 1 : 0 }}>
      {children}
      <AbsoluteFill style={{ background: "#fff", opacity: Math.max(0, white * 1.2 - 0.1), pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

/**
 * ECHO ZOOM — After-Effects-style radial zoom blur WITHOUT shaders: the scene is stacked N times,
 * each copy more scaled (and optionally rotated) and fainter → reads as a true radial streak.
 * Only costs extra on the ~7 transition frames, so it's CPU-cheap (unlike HTML-in-canvas shaders).
 */
const echoZoom = (spin: number): Comp => ({ children, presentationDirection: dir, presentationProgress: p }) => {
  const enter = dir === "entering";
  const k = Math.sin(p * Math.PI); // streak intensity peaks mid-cut
  const base = enter ? interpolate(p, [0, 1], [1.7, 1]) : interpolate(p, [0, 1], [1, 2.4]);
  const opacity = enter ? interpolate(p, [0.35, 0.65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : interpolate(p, [0.35, 0.65], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const N = 7;
  return (
    <AbsoluteFill style={{ transform: `scale(${base}) rotate(${(enter ? 1 - p : p) * spin * 2}deg)`, opacity }}>
      {Array.from({ length: N }, (_, i) => (
        <AbsoluteFill key={i} style={{ transform: `scale(${1 + i * 0.06 * k}) rotate(${i * spin * 0.6 * k}deg)`, opacity: i === 0 ? 1 : 0.42 * (1 - i / N) * k, filter: i ? `blur(${1 + i * 0.8 * k}px)` : undefined, mixBlendMode: i ? "screen" : undefined }}>
          {children}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

/** BURN — warm film-burn bloom sweeps across the cut (CSS stand-in for the filmBurn shader). */
const Burn: Comp = ({ children, presentationDirection: dir, presentationProgress: p }) => {
  const enter = dir === "entering";
  const k = Math.sin(p * Math.PI);
  return (
    <AbsoluteFill style={{ opacity: enter ? (p > 0.5 ? 1 : 0) : p <= 0.5 ? 1 : 0 }}>
      {children}
      <AbsoluteFill style={{ mixBlendMode: "screen", opacity: k, background: `radial-gradient(60% 45% at ${20 + p * 60}% ${70 - p * 40}%, rgba(255,170,80,0.95), rgba(200,16,46,0.75) 40%, transparent 75%)`, filter: "blur(20px)" }} />
      <AbsoluteFill style={{ background: "#fff", opacity: Math.max(0, k - 0.7) * 2 }} />
    </AbsoluteFill>
  );
};

export const zoomPunch = () => make(ZoomPunch);
export const whip = () => make(Whip);
export const glitch = () => make(Glitch);
export const flash = () => make(Flash);

/* ---------------- Selection ---------------- */

type Ctx = { width: number; height: number; rng: Rng; shaders: boolean; shaderChance?: number };
type Factory = (c: Ctx) => TransitionPresentation<P>;

const cast = (t: unknown) => t as TransitionPresentation<P>;

/** Every transition by name. Shader ones are only used when the renderer supports HTML-in-Canvas. */
export const TRANSITIONS: Record<string, { shader: boolean; make: Factory }> = {
  zoomPunch: { shader: false, make: () => zoomPunch() },
  whip: { shader: false, make: () => whip() },
  glitch: { shader: false, make: () => glitch() },
  flash: { shader: false, make: () => flash() },
  echoZoom: { shader: false, make: () => make(echoZoom(0)) },
  spinZoom: { shader: false, make: ({ rng }) => make(echoZoom(rng.sign() * 4)) },
  burn: { shader: false, make: () => make(Burn) },
  slide: { shader: false, make: ({ rng }) => cast(slide({ direction: rng.pick(["from-right", "from-bottom", "from-left"] as const) })) },
  wipe: { shader: false, make: ({ rng }) => cast(wipe({ direction: rng.pick(["from-left", "from-top-left", "from-bottom-right"] as const) })) },
  flip: { shader: false, make: ({ rng }) => cast(flip({ direction: rng.pick(["from-left", "from-right"] as const), perspective: 1800 })) },
  iris: { shader: false, make: ({ width, height }) => cast(iris({ width, height })) },
  cube: { shader: false, make: ({ rng }) => cast(cube({ direction: rng.pick(["from-left", "from-right"] as const), perspective: 2200 })) },
  pushCut: { shader: false, make: () => cast(pushCut()) },
  fade: { shader: false, make: () => cast(fade()) },
  zoomBlur: { shader: true, make: ({ rng }) => cast(zoomBlur({ rotation: rng.range(-8, 8) })) },
  filmBurn: { shader: true, make: () => cast(filmBurn({})) },
  crosswarp: { shader: true, make: () => cast(crosswarp({})) },
  crossZoom: { shader: true, make: () => cast(crossZoom({})) },
  dreamyZoom: { shader: true, make: () => cast(dreamyZoom({})) },
  ripple: { shader: true, make: () => cast(ripple({})) },
  swap: { shader: true, make: () => cast(swap({})) },
  blurSlide: { shader: true, make: () => cast(blurSlide({})) },
};

/** Energy buckets — hype beats get violent cuts, calm beats get soft ones. */
const BY_ENERGY: Record<1 | 2 | 3, { css: string[]; shader: string[]; frames: number }> = {
  3: { css: ["echoZoom", "spinZoom", "zoomPunch", "whip", "glitch", "flash", "burn"], shader: ["zoomBlur", "crossZoom", "filmBurn"], frames: 8 },
  2: { css: ["slide", "pushCut", "wipe", "cube", "whip", "echoZoom", "burn"], shader: ["crosswarp", "swap", "blurSlide"], frames: 10 },
  1: { css: ["fade", "iris", "flip"], shader: ["dreamyZoom", "ripple"], frames: 14 },
};

/** Pick the transition INTO the next beat. Never repeats the previous one back-to-back. */
export function pickTransition(beat: TimedBeat, c: Ctx, prev: string | null): { name: string; frames: number; presentation: TransitionPresentation<P> } {
  const bucket = BY_ENERGY[beat.energy];
  const forced = beat.transition && TRANSITIONS[beat.transition];
  if (forced && (!forced.shader || c.shaders)) {
    return { name: beat.transition!, frames: bucket.frames, presentation: forced.make(c) };
  }
  // Mix shader looks in only some of the time, so it's not ALL shaders (they read as effects).
  const pool = c.shaders && c.rng.chance(c.shaderChance ?? 0.5) ? bucket.shader : bucket.css;
  const options = pool.filter((n) => n !== prev);
  const name = c.rng.pick(options.length ? options : pool);
  return { name, frames: bucket.frames, presentation: TRANSITIONS[name].make(c) };
}
