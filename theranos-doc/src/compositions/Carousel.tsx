import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import carousel from "../data/carousel.json";
import { CandleChart, Candle, Overlay, Level } from "../components/CandleChart";

/**
 * A swipeable LinkedIn / Instagram carousel, rendered as one still per slide.
 * The composition shows slide[frame], so `remotion render --sequence` emits one image per slide.
 * Square (1080x1080) — the safe format for both platforms.
 * Slides are either text cards (cover/point/cta) or full real CHART slides (kind: "chart").
 */

type ChartSlide = {
  kind: "chart"; candles: Candle[]; overlays?: Overlay[]; levels?: Level[];
  name: string; pair: string; timeframe: string; price: number; changePct: number;
  decimals: number; callout?: string; dateLabel?: string;
};
type Slide =
  | { kind: "cover"; headline: string; sub?: string }
  | { kind: "point"; n?: number; headline: string; body?: string }
  | { kind: "cta"; headline: string; body?: string }
  | ChartSlide;

const FONT = "Inter, system-ui, sans-serif";

export const Carousel: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const data = carousel as unknown as {
    accentColor: string;
    brand: string;
    tagline?: string;
    slides: Slide[];
  };
  const slides = data.slides || [];
  const slide = slides[Math.min(frame, slides.length - 1)] || { kind: "cover", headline: data.brand };
  const accent = data.accentColor || "#e11d48";
  const points = slides.filter((s) => s.kind === "point").length;

  // Full-bleed real chart slide.
  if (slide.kind === "chart") {
    const c = slide as ChartSlide;
    return (
      <CandleChart
        candles={c.candles}
        overlays={c.overlays || []}
        levels={c.levels || []}
        name={c.name}
        pair={c.pair}
        timeframe={c.timeframe}
        price={c.price}
        changePct={c.changePct}
        decimals={c.decimals}
        callout={c.callout}
        dateLabel={c.dateLabel}
        still
        accent={accent}
        fontSize={Math.round(width * 0.04)}
        portrait={false}
      />
    );
  }

  const pad = width * 0.09;
  const brandRow = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        color: "#fff",
        fontFamily: FONT,
        fontWeight: 800,
        letterSpacing: 2,
        fontSize: width * 0.026,
      }}
    >
      <div style={{ width: 16, height: 16, borderRadius: 4, background: accent }} />
      {data.brand}
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0b" }}>
      {/* accent glow corner */}
      <div
        style={{
          position: "absolute",
          top: -width * 0.25,
          right: -width * 0.25,
          width: width * 0.6,
          height: width * 0.6,
          borderRadius: "50%",
          background: accent,
          opacity: 0.14,
          filter: "blur(60px)",
        }}
      />
      <AbsoluteFill style={{ padding: pad, justifyContent: "space-between" }}>
        {/* top row: brand + page number */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {brandRow}
          {slide.kind === "point" && slide.n ? (
            <div
              style={{
                color: accent,
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: width * 0.03,
                letterSpacing: 2,
              }}
            >
              {String(slide.n).padStart(2, "0")}
              <span style={{ color: "#555" }}>/{String(points).padStart(2, "0")}</span>
            </div>
          ) : null}
        </div>

        {/* body */}
        {slide.kind === "cover" ? (
          <div>
            <div
              style={{
                color: "#fff",
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: width * 0.078,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {slide.headline}
            </div>
            {slide.sub ? (
              <div
                style={{
                  marginTop: 26,
                  color: "#9aa3ad",
                  fontFamily: FONT,
                  fontWeight: 500,
                  fontSize: width * 0.03,
                }}
              >
                {slide.sub}
              </div>
            ) : null}
          </div>
        ) : slide.kind === "cta" ? (
          <div>
            <div
              style={{
                color: "#fff",
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: width * 0.07,
                lineHeight: 1.08,
              }}
            >
              {slide.headline}
            </div>
            {slide.body ? (
              <div
                style={{
                  marginTop: 24,
                  color: "#c7ccd1",
                  fontFamily: FONT,
                  fontWeight: 500,
                  fontSize: width * 0.032,
                  lineHeight: 1.4,
                }}
              >
                {slide.body}
              </div>
            ) : null}
            <div
              style={{
                marginTop: 40,
                display: "inline-block",
                padding: "18px 40px",
                borderRadius: 999,
                background: accent,
                color: "#0a0a0b",
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: width * 0.032,
              }}
            >
              + Follow {data.brand}
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                color: accent,
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: width * 0.055,
                lineHeight: 1.1,
                letterSpacing: -0.5,
              }}
            >
              {slide.headline}
            </div>
            {slide.body ? (
              <div
                style={{
                  marginTop: 28,
                  color: "#e7e9ec",
                  fontFamily: FONT,
                  fontWeight: 500,
                  fontSize: width * 0.038,
                  lineHeight: 1.42,
                }}
              >
                {slide.body}
              </div>
            ) : null}
          </div>
        )}

        {/* bottom row: tagline / swipe hint */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#6b7280",
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: width * 0.024,
            letterSpacing: 1,
          }}
        >
          <span>{data.tagline}</span>
          {slide.kind === "cover" ? <span style={{ color: accent }}>swipe →</span> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
