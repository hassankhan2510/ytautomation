import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

/**
 * Subtle animated film grain. The turbulence filter is the single most expensive
 * thing to render per frame, so we compute it at quarter resolution (480x270) and
 * scale it up 4x with CSS. That's ~16x fewer pixels for the filter to process —
 * visually identical grain, dramatically faster renders.
 */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => {
  const frame = useCurrentFrame();
  const seed = frame % 97;
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <div
        style={{
          width: 480,
          height: 270,
          transform: "scale(4)",
          transformOrigin: "top left",
          imageRendering: "pixelated",
        }}
      >
        <svg width={480} height={270}>
          <filter id="filmgrain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={2}
              seed={seed}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width={480} height={270} filter="url(#filmgrain)" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};
