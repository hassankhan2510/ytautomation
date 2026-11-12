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

export const zoomPunch = () => make(ZoomPunch);
export const whip = () => make(Whip);
export const glitch = () => make(Glitch);
export const flash = () => make(Flash);

/* ---------------- Selection ---------------- */

type Ctx = { width: number; height: number; rng: Rng; shaders: boolean };
type Factory = (c: Ctx) => TransitionPresentation<P>;

const cast = (t: unknown) => t as TransitionPresentation<P>;

/** Every transition by name. Shader ones are only used when the renderer supports HTML-in-Canvas. */
export const TRANSITIONS: Record<string, { shader: boolean; make: Factory }> = {
  zoomPunch: { shader: false, make: () => zoomPunch() },
  whip: { shader: false, make: () => whip() },
  glitch: { shader: false, make: () => glitch() },
  flash: { shader: false, make: () => flash() },
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
  3: { css: ["zoomPunch", "whip", "glitch", "flash"], shader: ["zoomBlur", "crossZoom", "filmBurn"], frames: 7 },
  2: { css: ["slide", "pushCut", "wipe", "cube", "whip"], shader: ["crosswarp", "swap", "blurSlide"], frames: 10 },
  1: { css: ["fade", "iris", "flip"], shader: ["dreamyZoom", "ripple"], frames: 14 },
};

/** Pick the transition INTO the next beat. Never repeats the previous one back-to-back. */
export function pickTransition(beat: TimedBeat, c: Ctx, prev: string | null): { name: string; frames: number; presentation: TransitionPresentation<P> } {
  const bucket = BY_ENERGY[beat.energy];
  const forced = beat.transition && TRANSITIONS[beat.transition];
  if (forced && (!forced.shader || c.shaders)) {
    return { name: beat.transition!, frames: bucket.frames, presentation: forced.make(c) };
  }
  // Mix shader looks in ~half the time when available, so it's not ALL shaders (they read as effects).
  const pool = c.shaders && c.rng.chance(0.5) ? bucket.shader : bucket.css;
  const options = pool.filter((n) => n !== prev);
  const name = c.rng.pick(options.length ? options : pool);
  return { name, frames: bucket.frames, presentation: TRANSITIONS[name].make(c) };
}
