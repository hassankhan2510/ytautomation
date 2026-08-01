import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const FONT = "Inter, system-ui, sans-serif";

/** Opening logo sting: brand name scales in over a wiping accent underline. */
export const Intro: React.FC<{ brand: string; tagline?: string; accent: string }> = ({
  brand,
  tagline,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;

  const s = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(s, [0, 1], [0.82, 1]);
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const underline = interpolate(s, [0, 1], [0, 1]);
  const size = portrait ? width * 0.1 : width * 0.072;

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#08080a", justifyContent: "center", alignItems: "center" }}
    >
      <div style={{ transform: `scale(${scale})`, opacity, textAlign: "center" }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            letterSpacing: portrait ? 4 : 8,
            fontSize: size,
            color: "#fff",
          }}
        >
          {brand}
        </div>
        <div
          style={{
            height: 6,
            marginTop: 18,
            width: portrait ? width * 0.42 : width * 0.22,
            marginLeft: "auto",
            marginRight: "auto",
            background: accent,
            transform: `scaleX(${underline})`,
            transformOrigin: "center",
            borderRadius: 4,
          }}
        />
        {tagline ? (
          <div
            style={{
              marginTop: 20,
              color: "#9aa3ad",
              fontFamily: FONT,
              fontWeight: 500,
              letterSpacing: 3,
              textTransform: "uppercase",
              fontSize: size * 0.2,
            }}
          >
            {tagline}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** Closing end-card: a subscribe pill + the brand, rising into place. */
export const Outro: React.FC<{ brand: string; tagline?: string; accent: string }> = ({
  brand,
  tagline,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;

  const s = spring({ frame, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [34, 0]);
  const op = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const size = portrait ? width * 0.058 : width * 0.038;

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#08080a", justifyContent: "center", alignItems: "center" }}
    >
      <div style={{ transform: `translateY(${y}px)`, opacity: op, textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            padding: portrait ? "18px 42px" : "16px 42px",
            borderRadius: 999,
            background: accent,
            color: "#08080a",
            fontWeight: 800,
            fontSize: size,
            fontFamily: FONT,
            letterSpacing: 2,
          }}
        >
          ▶ SUBSCRIBE
        </div>
        <div
          style={{
            marginTop: 34,
            color: "#fff",
            fontWeight: 800,
            letterSpacing: portrait ? 4 : 6,
            fontSize: size * 1.3,
            fontFamily: FONT,
          }}
        >
          {brand}
        </div>
        {tagline ? (
          <div
            style={{
              marginTop: 14,
              color: "#9aa3ad",
              letterSpacing: 3,
              textTransform: "uppercase",
              fontSize: size * 0.5,
              fontFamily: FONT,
            }}
          >
            {tagline}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
