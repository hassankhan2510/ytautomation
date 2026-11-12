import { Easing, interpolate, spring } from "remotion";

/**
 * MOTION FEEL — the "editor's hand" shared by every primitive. Tuned for short-form: fast attack,
 * a little overshoot, and nothing ever fully still (dead frames lose viewers).
 */
export const SPRINGS = {
  snap: { damping: 14, stiffness: 220, mass: 0.6 },   // UI pops, chips
  slam: { damping: 9, stiffness: 170, mass: 0.7 },    // big words landing (visible overshoot)
  smooth: { damping: 200, stiffness: 120, mass: 1 },  // reveals, no overshoot
  float: { damping: 30, stiffness: 60, mass: 1 },     // slow settles
} as const;

export const pop = (frame: number, fps: number, delay = 0, cfg: keyof typeof SPRINGS = "snap") =>
  spring({ frame: frame - delay, fps, config: SPRINGS[cfg] });

/** 0→1 over [start, start+dur] with an expo ease-out (the classic "AE ease"). */
export const easeOut = (frame: number, start: number, dur: number) =>
  interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

export const easeInOut = (frame: number, start: number, dur: number) =>
  interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Slow continuous push so a held frame still breathes. */
export const drift = (frame: number, total: number, amount = 0.04) =>
  1 + interpolate(frame, [0, Math.max(1, total)], [0, amount], { extrapolateRight: "clamp" });

/** Fit a font size so the longest token fits `maxWidth` (rough glyph-width model; condensed fonts ≈0.5em). */
export const fitSize = (tokens: string[], maxWidth: number, maxSize: number, minSize: number, glyph = 0.56) => {
  const longest = Math.max(1, ...tokens.map((t) => t.length));
  return Math.max(minSize, Math.min(maxSize, maxWidth / (longest * glyph)));
};
