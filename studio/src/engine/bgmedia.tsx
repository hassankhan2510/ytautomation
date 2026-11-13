import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { useRender } from "./render-context";
import { alpha } from "./theme";
import { hash01 } from "./rng";
import type { TimedBeat } from "./types";
import { Parallax25D } from "./parallax";

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
  // Neutral scrim (dark on dark themes, light on light themes) so the FOOTAGE keeps its real colours;
  // heavier at the top and bottom where titles + captions sit, light in the middle. Brand colour is only
  // a faint wash — a full theme-colour scrim made every clip look orange/purple.
  const shade = theme.dark ? "#000000" : "#FFFFFF";
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: theme.bg }}>
      {beat.layers ? (
        <Parallax25D layers={beat.layers} t={t} seed={seed + beat.index} />
      ) : (
      <AbsoluteFill style={{ transform: kb }}>
        {beat.bgKind === "video" ? (
          <OffthreadVideo src={src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${alpha(shade, 0.62)} 0%, ${alpha(shade, 0.3)} 26%, ${alpha(shade, 0.26)} 55%, ${alpha(shade, 0.72)} 100%)`,
        }}
      />
      <AbsoluteFill style={{ background: alpha(theme.vivid ? theme.accent : theme.bg2, theme.vivid ? 0.07 : 0.12) }} />
    </AbsoluteFill>
  );
};
