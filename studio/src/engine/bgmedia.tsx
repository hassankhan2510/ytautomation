import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { useRender } from "./render-context";
import { alpha } from "./theme";
import { hash01 } from "./rng";
import type { TimedBeat } from "./types";

/**
 * REAL BACKGROUND — stock video or photo matching what's being said, behind every scene.
 * A theme-tinted scrim keeps text/graphics readable on any footage (heavier at the top and bottom
 * where captions and titles sit). Photos get a slow seeded Ken-Burns push/pan so nothing is static.
 */
export const BgMedia: React.FC<{ beat: TimedBeat; seed: number }> = ({ beat, seed }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  if (!beat.bgSrc) return null;
  const src = staticFile(beat.bgSrc);
  const t = frame / Math.max(1, beat.frames);
  const dir = hash01(seed, beat.index) > 0.5 ? 1 : -1;
  const kb = beat.bgKind === "image"
    ? `scale(${interpolate(t, [0, 1], [1.08, 1.2])}) translate(${dir * interpolate(t, [0, 1], [-1.5, 1.5])}%, ${interpolate(t, [0, 1], [1, -1])}%)`
    : `scale(${interpolate(t, [0, 1], [1.04, 1.1])})`;
  // Scrim strength: text-heavy and calm beats get more, so the words always win over the footage.
  const base = theme.vivid ? 0.5 : theme.dark ? 0.52 : 0.58;
  const mid = base - 0.12;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: theme.bg }}>
      <AbsoluteFill style={{ transform: kb }}>
        {beat.bgKind === "video" ? (
          <OffthreadVideo src={src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${alpha(theme.bg, base + 0.18)} 0%, ${alpha(theme.bg, mid)} 30%, ${alpha(theme.bg, mid)} 58%, ${alpha(theme.bg, base + 0.28)} 100%)`,
        }}
      />
      {theme.vivid ? <AbsoluteFill style={{ background: alpha(theme.accent, 0.1) }} /> : null}
    </AbsoluteFill>
  );
};
