import React, { useEffect, useRef, useState } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Primitive } from "./primitives";

/**
 * SKETCH — renders ONE primitive in the premium "living ink" 2.5D style:
 *   1) the outline STROKES on (hand-drawing) via animated stroke-dashoffset,
 *   2) the closed region then FILLS with an accent gradient + a spring scale-pop and a soft drop
 *      shadow, so it "lifts off the page" (the 2.5D depth cue),
 *   3) a gentle continuous float keeps it alive.
 * Pure SVG/CSS — CPU-only, $0, deterministic.
 */
export const Sketch: React.FC<{
  primitive: Primitive;
  accent: string;
  delay?: number;      // frames to wait before starting
  drawFrames?: number; // how long the stroke-on takes
  size?: number;       // px
}> = ({ primitive, accent, delay = 0, drawFrames = 34, size = 320 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(1200);
  useEffect(() => { if (ref.current) setLen(ref.current.getTotalLength()); }, [primitive.draw]);

  const t = frame - delay;
  const dash = interpolate(t, [0, drawFrames], [len, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const appear = interpolate(t, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Fill pops in once the outline is ~70% drawn.
  const fillStart = drawFrames * 0.7;
  const fillSpring = spring({ frame: t - fillStart, fps, config: { damping: 200 } });
  const float = Math.sin((frame + delay) / 26) * 4; // slow living-ink bob
  const gid = `g_${primitive.id}`;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: "visible", opacity: appear, transform: `translateY(${float}px)` }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.95} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.62} />
        </linearGradient>
        <filter id={`${gid}_sh`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0b1220" floodOpacity="0.22" />
        </filter>
      </defs>
      <g filter={`url(#${gid}_sh)`}>
        {primitive.fill ? (
          <path
            d={primitive.fill}
            fill={`url(#${gid})`}
            opacity={fillSpring}
            style={{ transform: `scale(${interpolate(fillSpring, [0, 1], [0.9, 1])})`, transformOrigin: "50px 50px" }}
          />
        ) : null}
        <path
          ref={ref}
          d={primitive.draw}
          fill="none"
          stroke="#1f2937"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={dash}
        />
      </g>
    </svg>
  );
};
