import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { Sketch } from "./Sketch";

export type Scene = { text: string; primitives: string[]; startFrame: number; durationInFrames: number; audio?: string };
export type ScenesDoc = { meta: { accent?: string; ink?: string; brand?: string }; scenes: Scene[]; totalDurationInFrames: number };

const DISPLAY = 'Inter, "Segoe UI", system-ui, sans-serif';

export const WhiteboardVideo: React.FC<{ doc: ScenesDoc }> = ({ doc }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = doc.meta.accent || "#e11d48";
  const ink = doc.meta.ink || "#141a22";
  const scenes = doc.scenes;

  // Continuous camera pan across an infinite canvas: one panel per scene, eased between scene starts.
  const panelW = width;
  const starts = scenes.map((s) => s.startFrame);
  const xs = scenes.map((_, i) => -i * panelW);
  const camX = interpolate(
    frame,
    [...starts, doc.totalDurationInFrames],
    [...xs, xs[xs.length - 1] ?? 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) },
  );
  // subtle breathing zoom
  const scale = 1 + Math.sin((frame / 30) * 0.5) * 0.012;

  return (
    <AbsoluteFill style={{ backgroundColor: "#f7f7f2", fontFamily: DISPLAY }}>
      {/* premium paper: warm gradient + faint dot grid (parallax slower than foreground) + vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 30%, #fdfdfb, #eef0ea 70%, #e6e8e1)" }} />
      <AbsoluteFill
        style={{
          transform: `translateX(${camX * 0.35}px)`,
          width: panelW * Math.max(1, scenes.length) * 1.4,
          backgroundImage: "radial-gradient(rgba(20,26,34,0.06) 1.6px, transparent 1.6px)",
          backgroundSize: "38px 38px",
          opacity: 0.7,
        }}
      />
      {/* accent hairline top + brand */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: accent }} />
      <div style={{ position: "absolute", top: 34, left: 54, fontWeight: 800, fontSize: 30, letterSpacing: 2, color: ink, opacity: 0.85 }}>
        {doc.meta.brand || ""}
      </div>

      {/* the panning canvas of scene panels */}
      <AbsoluteFill style={{ transform: `translateX(${camX}px) scale(${scale})`, transformOrigin: `${width / 2}px ${height / 2}px` }}>
        {scenes.map((s, i) => (
          <ScenePanel key={i} scene={s} index={i} panelW={panelW} height={height} accent={accent} ink={ink} />
        ))}
      </AbsoluteFill>

      {/* per-scene voiceover */}
      {scenes.map((s, i) =>
        s.audio ? (
          <Sequence key={`a${i}`} from={s.startFrame} durationInFrames={s.durationInFrames}>
            <Audio src={staticFile(s.audio)} />
          </Sequence>
        ) : null,
      )}

      {/* soft vignette for depth */}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 260px rgba(20,26,34,0.10)", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

const ScenePanel: React.FC<{ scene: Scene; index: number; panelW: number; height: number; accent: string; ink: string }> = ({
  scene, index, panelW, height, accent, ink,
}) => {
  const frame = useCurrentFrame();
  const local = frame - scene.startFrame;
  const prims = (scene.primitives || []).slice(0, 3);
  const iconSize = prims.length >= 3 ? 300 : prims.length === 2 ? 340 : 420;
  const gap = 90;
  const rowW = prims.length * iconSize + (prims.length - 1) * gap;
  const left = index * panelW + (panelW - rowW) / 2;
  const top = height * 0.24;

  const capOpacity = interpolate(local, [16, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capY = interpolate(local, [16, 30], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      {prims.map((id, j) => (
        <div key={j} style={{ position: "absolute", left: left + j * (iconSize + gap), top, width: iconSize, height: iconSize }}>
          {/* stagger each icon's draw-on; wrap in a Sequence so its local frame starts at the stagger point */}
          <Sequence from={scene.startFrame + 6 + j * 16} layout="none">
            <Sketch id={id} accent={accent} ink={ink} size={iconSize} />
          </Sequence>
          {/* connective arrow between icons (drawn, not a primitive) */}
          {j < prims.length - 1 ? (
            <div style={{ position: "absolute", right: -gap - 6, top: iconSize / 2 - 20, width: gap + 12, height: 40, opacity: interpolate(local, [10 + j * 16, 26 + j * 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              <svg viewBox="0 0 60 40" width="100%" height="100%"><path d="M4 20 H46 M36 10 L52 20 L36 30" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} /></svg>
            </div>
          ) : null}
        </div>
      ))}

      {/* caption */}
      <div
        style={{
          position: "absolute",
          left: index * panelW + panelW * 0.12,
          width: panelW * 0.76,
          top: height * 0.68,
          textAlign: "center",
          fontSize: 62,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: -1,
          color: ink,
          opacity: capOpacity,
          transform: `translateY(${capY}px)`,
        }}
      >
        {scene.text}
        <div style={{ height: 8, width: 120, background: accent, borderRadius: 4, margin: "26px auto 0" }} />
      </div>
    </>
  );
};
