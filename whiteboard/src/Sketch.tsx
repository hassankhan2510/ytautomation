import React, { useEffect, useRef, useState } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { byId } from "./primitives";

/**
 * One primitive rendered as premium 2.5D "living ink":
 *   1) the outline STROKES on (hand-drawing),
 *   2) then the fill region lifts off the page — gradient + drop-shadow + a spring scale-pop,
 *   3) a gentle continuous float so it feels alive, not static.
 * Frame is LOCAL (place inside a <Sequence>). Colours come from the accent.
 */
export const Sketch: React.FC<{
  id: string;
  accent?: string;
  ink?: string;
  drawFrames?: number;
  size?: number;
}> = ({ id, accent = "#e11d48", ink = "#141a22", drawFrames = 26, size = 320 }) => {
  const prim = byId(id);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(600);
  useEffect(() => { if (ref.current) setLen(ref.current.getTotalLength()); }, [id]);

  if (!prim) return null;
  const uid = `g_${id}`;

  // 1) draw-on
  const dashoffset = interpolate(frame, [0, drawFrames], [len, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // 2) fill lift (after the outline is mostly drawn)
  const fillStart = drawFrames - 4;
  const pop = spring({ frame: frame - fillStart, fps, config: { damping: 12, mass: 0.6 } });
  const fillOpacity = interpolate(frame, [fillStart, fillStart + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lift = interpolate(pop, [0, 1], [0, 1]);
  // 3) gentle float
  const floatY = Math.sin((frame / fps) * 1.1) * 4;

  return (
    <div style={{ width: size, height: size, transform: `translateY(${floatY}px)` }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} />
            <stop offset="100%" stopColor={shade(accent, -0.35)} />
          </linearGradient>
          <filter id={`${uid}_s`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy={3.5} stdDeviation={3} floodColor="rgba(0,0,0,0.28)" />
          </filter>
        </defs>

        {/* soft ground shadow that grows as the ink lifts */}
        {prim.fill ? (
          <ellipse cx="50" cy="94" rx={26 * lift} ry={4 * lift} fill="rgba(0,0,0,0.14)" />
        ) : null}

        {/* the FILL region, lifted off the page */}
        {prim.fill ? (
          <g style={{ transformOrigin: "50px 50px", transform: `scale(${interpolate(pop, [0, 1], [0.86, 1])})`, filter: `url(#${uid}_s)` }}>
            <path d={prim.fill} fill={`url(#${uid})`} opacity={fillOpacity} />
          </g>
        ) : null}

        {/* the OUTLINE, drawn on and kept crisp on top */}
        <path
          ref={ref}
          d={prim.draw}
          fill="none"
          stroke={ink}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={dashoffset}
        />
      </svg>
    </div>
  );
};

// darken/lighten a #rrggbb by pct (-1..1)
function shade(hex: string, pct: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const f = pct < 0 ? 0 : 255, t = Math.abs(pct);
  const r = Math.round(((n >> 16) & 255) * (1 - t) + f * t);
  const g = Math.round(((n >> 8) & 255) * (1 - t) + f * t);
  const b = Math.round((n & 255) * (1 - t) + f * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
