import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import thumb from "../data/thumbnail.json";

/**
 * A 1280x720 YouTube thumbnail = AI background + our text layer, built for CTR.
 * Four distinct layouts (variant 0–3) so every video's thumbnail doesn't look the same.
 * Rendered as a single still (no video).
 */

type Line = { t: string; hi?: boolean };
type Data = {
  bg?: string | null;
  brand?: string;
  accent: string;
  lines: Line[];
  sub?: string;
  variant?: number;
};

const FONT = "Inter, Montserrat, Arial, sans-serif";

const Bg: React.FC<{ src?: string | null; accent: string }> = ({ src, accent }) =>
  src ? (
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <AbsoluteFill style={{ background: `radial-gradient(120% 120% at 78% 22%, ${accent}22, #0a0a0b 60%)` }} />
  );

const BrandChip: React.FC<{ brand?: string; accent: string; style?: React.CSSProperties }> = ({ brand, accent, style }) =>
  brand ? (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 11,
        padding: "8px 18px",
        borderRadius: 999,
        background: "rgba(10,10,11,0.55)",
        border: `2px solid ${accent}`,
        color: "#fff",
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 24,
        letterSpacing: 3,
        ...style,
      }}
    >
      <span style={{ width: 13, height: 13, borderRadius: 3, background: accent }} />
      {brand}
    </div>
  ) : null;

const Title: React.FC<{ lines: Line[]; accent: string; size: number; align?: "left" | "center" }> = ({
  lines,
  accent,
  size,
  align = "left",
}) => (
  <div
    style={{
      fontFamily: FONT,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 0.96,
      letterSpacing: -2,
      textAlign: align,
      textShadow: "0 6px 34px rgba(0,0,0,0.7)",
    }}
  >
    {lines.map((l, i) => (
      <div key={i} style={{ color: l.hi ? accent : "#FFFFFF" }}>
        {l.t}
      </div>
    ))}
  </div>
);

export const Thumbnail: React.FC = () => {
  const d = thumb as unknown as Data;
  const accent = d.accent || "#10B981";
  const lines = d.lines || [];
  const v = (((d.variant ?? 0) % 4) + 4) % 4;

  // Variant 1 — BOTTOM BAND: image on top, solid band with the title across the bottom.
  if (v === 1) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0a0a0b" }}>
        <Bg src={d.bg} accent={accent} />
        <BrandChip brand={d.brand} accent={accent} style={{ position: "absolute", top: 40, left: 44 }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: "40%",
            padding: "34px 56px 40px",
            background: "linear-gradient(0deg, #08080a 62%, rgba(8,8,10,0) 100%)",
            borderTop: `6px solid ${accent}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            gap: 14,
          }}
        >
          <Title lines={lines} accent={accent} size={100} />
          {d.sub ? (
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 36, color: "#c7ccd1" }}>{d.sub}</div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  // Variant 2 — CENTER PUNCH: full image, heavy vignette, huge centered title, accent frame.
  if (v === 2) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0a0a0b" }}>
        <Bg src={d.bg} accent={accent} />
        <AbsoluteFill style={{ background: "radial-gradient(80% 80% at 50% 50%, rgba(0,0,0,0.35), rgba(0,0,0,0.82))" }} />
        <AbsoluteFill
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: 60 }}
        >
          <BrandChip brand={d.brand} accent={accent} />
          <Title lines={lines} accent={accent} size={118} align="center" />
          {d.sub ? (
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 38, color: accent, textAlign: "center" }}>{d.sub}</div>
          ) : null}
        </AbsoluteFill>
        <div style={{ position: "absolute", inset: 18, border: `4px solid ${accent}`, borderRadius: 10, pointerEvents: "none" }} />
      </AbsoluteFill>
    );
  }

  // Variant 3 — SIDE PANEL: solid text panel on the left, image on the right.
  if (v === 3) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0a0a0b" }}>
        <div style={{ position: "absolute", right: 0, top: 0, width: "60%", height: "100%" }}>
          <Bg src={d.bg} accent={accent} />
          <AbsoluteFill style={{ background: "linear-gradient(90deg, #0a0a0b 0%, rgba(10,10,11,0.2) 30%, rgba(0,0,0,0) 100%)" }} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "46%",
            height: "100%",
            background: "#0a0a0b",
            borderLeft: `10px solid ${accent}`,
            padding: "0 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 20,
          }}
        >
          <BrandChip brand={d.brand} accent={accent} style={{ alignSelf: "flex-start" }} />
          <Title lines={lines} accent={accent} size={86} />
          {d.sub ? (
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 32, color: "#c7ccd1" }}>{d.sub}</div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  // Variant 0 — LEFT CUT (default): image full, dark scrim on the left, text stacked left.
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0b" }}>
      <Bg src={d.bg} accent={accent} />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.62) 44%, rgba(0,0,0,0.12) 72%, rgba(0,0,0,0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 68,
          top: 0,
          bottom: 0,
          width: "72%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 22,
        }}
      >
        <BrandChip brand={d.brand} accent={accent} style={{ alignSelf: "flex-start" }} />
        <Title lines={lines} accent={accent} size={108} />
        {d.sub ? (
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 38, color: "#e7e9ec", textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}>
            {d.sub}
          </div>
        ) : null}
      </div>
      <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: 12, background: accent }} />
    </AbsoluteFill>
  );
};
