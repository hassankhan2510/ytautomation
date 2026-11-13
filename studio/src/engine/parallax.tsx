import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { hash01 } from "./rng";

export type DepthLayers = { far: string; mid: string; near: string };

/**
 * 2.5D PHOTO — three depth layers (made by scripts/depth25d.py) moving at different speeds:
 * a slow dolly-in where the near layer grows and drifts most, so the photo gains real depth.
 * Pure image transforms → cheap on CPU. `t` is 0..1 progress through the shot.
 */
export const Parallax25D: React.FC<{ layers: DepthLayers; t: number; seed: number; strength?: number; style?: React.CSSProperties }> = ({ layers, t, seed, strength = 1, style }) => {
  const dir = hash01(seed, 7) > 0.5 ? 1 : -1;
  const p = interpolate(t, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ease = 1 - Math.pow(1 - p, 1.6); // starts moving immediately, settles gently
  const layer = (src: string, s0: number, s1: number, dx: number, dy: number) => (
    <AbsoluteFill style={{ transform: `translate(${dir * dx * ease * strength}%, ${dy * ease * strength}%) scale(${s0 + (s1 - s0) * ease * strength})` }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ overflow: "hidden", ...style }}>
      {layer(layers.far, 1.08, 1.11, -0.5, 0)}
      {layer(layers.mid, 1.08, 1.15, 0.6, -0.3)}
      {layer(layers.near, 1.08, 1.22, 1.6, -0.8)}
    </AbsoluteFill>
  );
};
