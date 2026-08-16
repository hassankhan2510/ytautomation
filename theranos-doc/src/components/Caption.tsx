import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type Word = { text: string; start: number; end: number };
export type Layout = "lower-third" | "center" | "title";

type Props = {
  words: Word[];
  fallbackText: string;
  kicker?: string | null;
  layout?: Layout;
  accent: string;
  fontSize: number;
  maxWidth: number;
  portrait: boolean;
};

/** Karaoke-highlighted rich text used by every scene type. */
const KaraokeText: React.FC<{
  tokens: Word[];
  frame: number;
  accent: string;
  fontSize: number;
  align: "left" | "center";
  weight: number;
}> = ({ tokens, frame, accent, fontSize, align, weight }) => (
  <p
    style={{
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize,
      fontWeight: weight,
      margin: 0,
      lineHeight: 1.4,
      letterSpacing: "-0.5px",
      textAlign: align,
    }}
  >
    {tokens.map((w, i) => {
      const spoken = frame >= w.end;
      const current = frame >= w.start && frame < w.end;
      const color = current ? accent : spoken ? "#f8fafc" : "rgba(248,250,252,0.5)";
      // Strong dark shadow so text stays readable over ANY background now that the glass box is gone.
      const read = "0 2px 12px rgba(0,0,0,0.92), 0 0 4px rgba(0,0,0,0.95)";
      return (
        <span key={i} style={{ color, textShadow: current ? `0 0 24px ${accent}88, ${read}` : read }}>
          {w.text}
          {i < tokens.length - 1 ? " " : ""}
        </span>
      );
    })}
  </p>
);

const Kicker: React.FC<{ text: string; accent: string; frame: number; size: number }> = ({
  text,
  accent,
  frame,
  size,
}) => {
  const w = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
      <div style={{ height: 2, width: 44 * w, backgroundColor: accent }} />
      <span
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: size,
          fontWeight: 700,
          letterSpacing: "4px",
          textTransform: "uppercase",
          color: accent,
          opacity: w,
        }}
      >
        {text}
      </span>
    </div>
  );
};

export const Caption: React.FC<Props> = ({
  words,
  fallbackText,
  kicker,
  layout = "lower-third",
  accent,
  fontSize,
  maxWidth,
  portrait,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const slide = spring({ frame, fps, config: { mass: 0.5, damping: 14, stiffness: 140 } });
  const floatY = Math.sin(frame / 18) * 6;

  const opacityIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const opacityOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  const opacity = frame > durationInFrames - 12 ? opacityOut : opacityIn;

  const tokens: Word[] =
    words && words.length > 0
      ? words
      : fallbackText.split(" ").map((t) => ({ text: t, start: 0, end: 0 }));

  const kickerSize = Math.max(14, Math.round(fontSize * 0.34));

  // ---- TITLE: big centered hero with growing underline, no glass box --------
  if (layout === "title") {
    const scale = interpolate(slide, [0, 1], [0.92, 1]);
    // Title layout is for SHORT text. If someone passes a long line, scale the
    // font down so it never overflows into an unreadable wall of text.
    const titleFactor = tokens.length <= 5 ? 1.85 : tokens.length <= 9 ? 1.35 : 1.05;
    const underline = interpolate(frame, [12, 40], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return (
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", padding: "0 8%" }}
      >
        <div
          style={{
            opacity,
            transform: `scale(${scale}) translateY(${(1 - slide) * 24}px)`,
            textAlign: "center",
            maxWidth: maxWidth * 1.15,
          }}
        >
          {kicker ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Kicker text={kicker} accent={accent} frame={frame} size={kickerSize} />
            </div>
          ) : null}
          <KaraokeText
            tokens={tokens}
            frame={frame}
            accent={accent}
            fontSize={Math.round(fontSize * titleFactor)}
            align="center"
            weight={800}
          />
          <div
            style={{
              height: 5,
              width: `${underline * 55}%`,
              margin: "36px auto 0",
              backgroundColor: accent,
              boxShadow: `0 0 26px ${accent}`,
              borderRadius: 4,
            }}
          />
        </div>
      </AbsoluteFill>
    );
  }

  // ---- CENTER statement + LOWER-THIRD share the glass card ------------------
  const centered = layout === "center";
  const boxFont = centered ? Math.round(fontSize * 1.18) : fontSize;

  return (
    <AbsoluteFill
      style={{
        justifyContent: centered || portrait ? "center" : "flex-end",
        alignItems: centered || portrait ? "center" : "flex-start",
        padding: centered ? "0 8%" : portrait ? "0 70px 160px" : "0 0 130px 150px",
      }}
    >
      {/* No blocking card — text sits directly on the video/chart, kept readable by its shadow. */}
      <div
        style={{
          maxWidth: centered ? maxWidth * 0.96 : maxWidth,
          opacity,
          textAlign: centered ? "center" : "left",
          transform: `translateX(${(1 - slide) * (centered || portrait ? 0 : -120)}px) translateY(${
            (1 - slide) * (centered || portrait ? 40 : 0) + floatY
          }px)`,
        }}
      >
        {kicker ? <Kicker text={kicker} accent={accent} frame={frame} size={kickerSize} /> : null}
        <KaraokeText
          tokens={tokens}
          frame={frame}
          accent={accent}
          fontSize={boxFont}
          align={centered ? "center" : "left"}
          weight={centered ? 700 : 600}
        />
      </div>
    </AbsoluteFill>
  );
};
