import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/** Shared: fade the whole block out in the last frames so cuts feel clean. */
function useBlockOpacity() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inO = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const outO = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return frame > durationInFrames - 12 ? outO : inO;
}

/* ============================ STAT ============================
   A huge hero figure (e.g. "$9,000,000,000") with a label under it. */
export const Stat: React.FC<{
  stat: string;
  label: string;
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ stat, label, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useBlockOpacity();
  const pop = spring({ frame, fps, config: { mass: 0.6, damping: 12, stiffness: 130 } });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 8%" }}>
      <div style={{ textAlign: "center", opacity }}>
        <div
          style={{
            fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
            fontSize: Math.round(fontSize * (portrait ? 2.4 : 2.8)),
            fontWeight: 800,
            color: accent,
            letterSpacing: "-2px",
            transform: `scale(${scale})`,
            textShadow: `0 0 60px ${accent}66`,
            lineHeight: 1,
          }}
        >
          {stat}
        </div>
        <div
          style={{
            marginTop: 28,
            fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
            fontSize: Math.round(fontSize * 0.95),
            fontWeight: 500,
            color: "#f8fafc",
            opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ============================ QUOTE ============================
   A large pull-quote with an attribution line. */
export const Quote: React.FC<{
  text: string;
  cite?: string | null;
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ text, cite, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useBlockOpacity();
  const rise = spring({ frame, fps, config: { mass: 0.5, damping: 15 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: portrait ? "0 10%" : "0 15%" }}>
      <div style={{ textAlign: "center", opacity, transform: `translateY(${(1 - rise) * 30}px)`, maxWidth: 1400 }}>
        <div style={{ fontSize: Math.round(fontSize * 2.6), color: accent, fontWeight: 800, lineHeight: 0.6, marginBottom: 10 }}>
          &ldquo;
        </div>
        <p
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: Math.round(fontSize * 1.3),
            fontWeight: 500,
            fontStyle: "italic",
            color: "#f8fafc",
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {text}
        </p>
        {cite ? (
          <div
            style={{
              marginTop: 30,
              fontFamily: 'system-ui, sans-serif',
              fontSize: Math.round(fontSize * 0.7),
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            — {cite}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/* ============================ BULLETS ============================
   A list that reveals one item at a time across the scene. */
export const Bullets: React.FC<{
  heading?: string | null;
  items: string[];
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ heading, items, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = useBlockOpacity();

  // Spread the reveals across ~70% of the scene so the last item isn't rushed.
  const revealSpan = durationInFrames * 0.7;
  const per = items.length > 0 ? revealSpan / items.length : revealSpan;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: portrait ? "center" : "flex-start",
        padding: portrait ? "0 80px" : "0 0 0 180px",
      }}
    >
      <div style={{ opacity, maxWidth: portrait ? "86%" : "70%" }}>
        {heading ? (
          <div
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: Math.round(fontSize * 1.15),
              fontWeight: 800,
              color: "#f8fafc",
              marginBottom: 36,
            }}
          >
            {heading}
          </div>
        ) : null}
        {items.map((item, i) => {
          const start = i * per;
          const s = spring({ frame: frame - start, fps, config: { mass: 0.5, damping: 14 } });
          const itemOpacity = interpolate(frame - start, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                marginBottom: 26,
                opacity: itemOpacity,
                transform: `translateX(${(1 - s) * -40}px)`,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  backgroundColor: accent,
                  boxShadow: `0 0 16px ${accent}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
                  fontSize: Math.round(fontSize * 1.05),
                  fontWeight: 500,
                  color: "#f8fafc",
                }}
              >
                {item}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
