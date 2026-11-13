/**
 * DEPTH family — photos that move like footage.
 * `parallax`: a full-screen still (archival photo via `search`, AI image via `prompt`, or uploaded `src`)
 * brought to life in 2.5D by scripts/depth25d.py (far/mid/near layers + dolly). Without layers it
 * falls back to a smooth Ken-Burns move; without any image, to a clean title card (never demo data).
 */
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeOut, fitSize, pop } from "../engine/motion";
import { Parallax25D, type DepthLayers } from "../engine/parallax";
import { prop, Safe, type PrimitiveProps } from "./common";

export const Parallax: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const file = prop<string>(beat, "src", "");
  const layers = (beat.props?.layers as DepthLayers | undefined) || undefined;
  const stamp = prop<string>(beat, "stamp", "");
  const title = prop<string>(beat, "title", "");
  const t = frame / Math.max(1, beat.frames);
  const tag = pop(frame, fps, 6, "slam");
  const ti = easeOut(frame, 10, 12);
  const shade = theme.dark ? "#000000" : "#FFFFFF";

  if (!file && !layers) {
    return (
      <Safe>
        <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: fitSize((title || beat.text).split(/\s+/), 920, 120, 64, 0.56), lineHeight: 1.02, textAlign: "center", color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none", opacity: ti }}>{title || beat.text}</div>
      </Safe>
    );
  }
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {layers ? (
        <Parallax25D layers={layers} t={t} seed={seed + beat.index} strength={1.15} />
      ) : (
        <AbsoluteFill style={{ transform: `scale(${interpolate(t, [0, 1], [1.06, 1.18])})` }}>
          <Img src={file.startsWith("http") ? file : staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      )}
      {/* Readability: darker top/bottom for stamp + captions, the photo itself stays clear. */}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${alpha(shade, 0.45)} 0%, transparent 28%, transparent 62%, ${alpha(shade, 0.7)} 100%)` }} />
      {stamp ? (
        <div style={{ position: "absolute", left: 70, top: 250, transform: `rotate(-4deg) scale(${interpolate(tag, [0, 1], [2, 1])})`, transformOrigin: "left top", opacity: Math.min(1, tag * 1.5), border: `5px solid ${theme.accent}`, color: theme.accent, background: alpha(theme.dark ? "#000000" : "#FFFFFF", 0.55), padding: "6px 22px", fontFamily: theme.mono, fontWeight: 700, fontSize: 44, letterSpacing: 4 }}>{stamp.toUpperCase()}</div>
      ) : null}
      {title ? (
        <div style={{ position: "absolute", left: 70, right: 70, top: 1080, fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: fitSize(title.split(/\s+/), 940, 96, 56, 0.56), lineHeight: 1.02, color: theme.dark ? "#FFFFFF" : "#111111", textTransform: theme.displayUpper ? "uppercase" : "none", textShadow: theme.dark ? "0 6px 30px rgba(0,0,0,0.7)" : "0 4px 20px rgba(255,255,255,0.8)", opacity: ti, transform: `translateY(${(1 - ti) * 30}px)` }}>{title}</div>
      ) : null}
    </AbsoluteFill>
  );
};
