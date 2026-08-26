import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Sketch } from "./Sketch";
import { byId } from "./primitives";

export type Scene = { text: string; primitives: string[]; from: number; durationInFrames: number };
export type WBData = {
  fps: number; width: number; height: number; accent: string; brand: string; title: string;
  audio?: string; scenes: Scene[]; totalDurationInFrames: number;
};

const INK = "#1f2937";

export const WhiteboardVideo: React.FC<{ data: WBData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const W = data.width, H = data.height;
  const accent = data.accent || "#e11d48";
  const scenes = data.scenes || [];

  // Continuous camera position (fractional scene index) — eases the pan across the infinite canvas.
  const starts = scenes.map((s) => s.from);
  const idxs = scenes.map((_, i) => i);
  const pos = scenes.length > 1
    ? interpolate(frame, starts, idxs, { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const camX = -pos * W;
  const parX = -pos * W * 0.55; // slower background layer = parallax depth

  return (
    <AbsoluteFill style={{ backgroundColor: "#faf9f5", fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif" }}>
      {/* Premium paper: warm gradient + faint dot grid + vignette. */}
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 0%, #ffffff, #f2f1ea 70%, #eae8df)" }} />
      <AbsoluteFill style={{ transform: `translateX(${parX}px)`, opacity: 0.5, backgroundImage: "radial-gradient(#d8d5c8 1.4px, transparent 1.6px)", backgroundSize: "46px 46px", width: W * (scenes.length + 1) }} />
      <AbsoluteFill style={{ boxShadow: "inset 0 0 240px rgba(20,24,33,0.10)" }} />

      {/* The panning canvas: each scene is one screen-width slot. */}
      <AbsoluteFill style={{ transform: `translateX(${camX}px)` }}>
        {scenes.map((s, i) => {
          const prims = (s.primitives || []).map(byId).filter(Boolean);
          const end = s.from + s.durationInFrames;
          const capIn = interpolate(frame, [s.from + 8, s.from + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const capY = interpolate(capIn, [0, 1], [26, 0]);
          const gone = interpolate(frame, [end - 10, end], [1, 0.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const size = prims.length >= 3 ? 300 : prims.length === 2 ? 340 : 400;
          return (
            <div key={i} style={{ position: "absolute", left: i * W, top: 0, width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 8%", opacity: gone }}>
              <div style={{ display: "flex", gap: W * 0.03, alignItems: "center", justifyContent: "center", marginBottom: 54, flexWrap: "wrap" }}>
                {prims.map((p, k) => (
                  <Sketch key={k} primitive={p!} accent={accent} delay={s.from + 6 + k * 12} size={size} />
                ))}
              </div>
              <div style={{ maxWidth: W * 0.74, textAlign: "center", fontSize: 62, lineHeight: 1.18, fontWeight: 800, color: INK, letterSpacing: -0.5, opacity: capIn, transform: `translateY(${capY}px)` }}>
                {s.text}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* Fixed brand header (foreground layer — doesn't pan). */}
      <div style={{ position: "absolute", top: 46, left: 60, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 18, height: 18, borderRadius: 5, background: accent, boxShadow: `0 0 18px ${accent}` }} />
        <div style={{ fontWeight: 800, fontSize: 30, color: INK, letterSpacing: 0.5 }}>{data.brand}</div>
      </div>
      <div style={{ position: "absolute", top: 92, left: 62, width: 58, height: 5, borderRadius: 3, background: accent, opacity: 0.9 }} />

      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}
    </AbsoluteFill>
  );
};
