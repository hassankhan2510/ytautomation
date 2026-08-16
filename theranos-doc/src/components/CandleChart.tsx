import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * CANDLESTICK CHART — a real, data-driven trading chart for the daily Gold/Bitcoin analysis reels.
 * Candles draw in left→right, moving-average / VWAP overlays trace over them, and support/resistance
 * lines fade in with labels. All values come from real market data (lib_market.mjs) — nothing invented.
 */

export type Candle = { o: number; h: number; l: number; c: number };
export type Overlay = { label: string; color?: string; points: (number | null)[] };
export type Level = { price: number; label: string; kind?: "support" | "resistance" | "level" };

const sans = 'system-ui, "Segoe UI", Roboto, sans-serif';
const mono = '"SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace';
const UP = "#16c784";
const DOWN = "#ea3943";

const Scrim: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(120% 100% at 50% 0%, #0d1622 0%, #060a12 70%, #04070c 100%)" }} />
);

function fmt(n: number, decimals: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const CandleChart: React.FC<{
  candles: Candle[];
  overlays?: Overlay[];
  levels?: Level[];
  name: string;        // "GOLD"
  pair: string;        // "XAU/USD"
  timeframe: string;   // "15m" / "Daily" / "Weekly"
  price: number;
  changePct: number;
  decimals: number;
  callout?: string | null; // short key words/numbers overlaid on the chart (the only "caption")
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ candles, overlays = [], levels = [], name, pair, timeframe, price, changePct, decimals, callout, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = frame > durationInFrames - 12 ? fadeOut : fadeIn;

  const n = Math.max(candles.length, 1);
  // Candles reveal progressively across the first ~65% of the scene.
  const shown = Math.max(1, Math.floor(interpolate(frame, [8, durationInFrames * 0.65], [1, n], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));

  // Chart geometry (inside the SVG viewBox = pixel space).
  const W = width;
  const H = height;
  const padX = W * 0.06;
  const chartTop = portrait ? H * 0.30 : H * 0.26;
  const chartBottom = portrait ? H * 0.80 : H * 0.86;
  const chartH = chartBottom - chartTop;
  const chartW = W - padX * 2 - (portrait ? 150 : 190); // leave room for the right-side price axis

  const allHi = Math.max(...candles.map((c) => c.h), ...levels.map((l) => l.price));
  const allLo = Math.min(...candles.map((c) => c.l), ...levels.map((l) => l.price));
  const pad = (allHi - allLo) * 0.08 || 1;
  const hi = allHi + pad, lo = allLo - pad;

  const yFor = (p: number) => chartTop + ((hi - p) / (hi - lo)) * chartH;
  const slot = chartW / n;
  const xFor = (i: number) => padX + slot * (i + 0.5);
  const bodyW = Math.max(2, slot * 0.62);

  const changeColor = changePct >= 0 ? UP : DOWN;
  const axisX = padX + chartW + (portrait ? 18 : 24);

  // Price axis ticks (5 evenly spaced).
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);

  const levelColor = (k?: string) => (k === "support" ? UP : k === "resistance" ? DOWN : accent);

  // Stagger level labels so close-together levels don't overlap (the dashed line stays at its price).
  const labelGap = Math.round(fontSize * 0.95);
  const leveled = [...levels].map((lv) => ({ ...lv, y: yFor(lv.price), labelY: yFor(lv.price) }));
  leveled.sort((a, b) => a.y - b.y);
  let lastLabelY = -Infinity;
  for (const lv of leveled) { lv.labelY = Math.max(lv.y, lastLabelY + labelGap); lastLabelY = lv.labelY; }

  return (
    <AbsoluteFill style={{ opacity }}>
      <Scrim />
      <AbsoluteFill>
        {/* Header */}
        <div style={{ position: "absolute", top: portrait ? H * 0.07 : H * 0.06, left: padX, right: padX, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: sans, fontWeight: 900, fontSize: Math.round(fontSize * 1.7), color: "#f8fafc", letterSpacing: "-1px", lineHeight: 1 }}>
              {name}
            </div>
            <div style={{ fontFamily: mono, fontWeight: 600, fontSize: Math.round(fontSize * 0.62), color: "rgba(226,232,240,0.6)", marginTop: 8, letterSpacing: "1px" }}>
              {pair} · {timeframe}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: mono, fontWeight: 800, fontSize: Math.round(fontSize * 1.25), color: "#f8fafc" }}>
              {fmt(price, decimals)}
            </div>
            <div style={{ fontFamily: mono, fontWeight: 800, fontSize: Math.round(fontSize * 0.72), color: changeColor, marginTop: 6 }}>
              {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Chart */}
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          {/* horizontal grid + price axis labels */}
          {ticks.map((t, i) => (
            <g key={`t${i}`}>
              <line x1={padX} y1={yFor(t)} x2={padX + chartW} y2={yFor(t)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={axisX} y={yFor(t) + 5} fill="rgba(226,232,240,0.55)" fontFamily={mono} fontSize={Math.round(fontSize * 0.5)}>
                {fmt(t, decimals)}
              </text>
            </g>
          ))}

          {/* support / resistance / key levels — line at the real price, label staggered to avoid overlap */}
          {leveled.map((lv, i) => {
            const o = interpolate(frame, [20 + i * 4, 32 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const col = levelColor(lv.kind);
            return (
              <g key={`lv${i}`} opacity={o}>
                <line x1={padX} y1={lv.y} x2={padX + chartW} y2={lv.y} stroke={col} strokeWidth={2} strokeDasharray="10 8" opacity={0.7} />
                <rect x={padX + 8} y={lv.labelY - Math.round(fontSize * 0.5)} width={Math.round(fontSize * (lv.label.length * 0.34 + 1.4))} height={Math.round(fontSize * 0.78)} rx={4} fill={col} opacity={0.18} />
                <text x={padX + 16} y={lv.labelY + 5} fill={col} fontFamily={mono} fontSize={Math.round(fontSize * 0.5)} fontWeight={700}>
                  {lv.label}
                </text>
              </g>
            );
          })}

          {/* candles (progressive reveal) */}
          {candles.slice(0, shown).map((c, i) => {
            const x = xFor(i);
            const up = c.c >= c.o;
            const col = up ? UP : DOWN;
            const yO = yFor(c.o), yC = yFor(c.c);
            const bodyTop = Math.min(yO, yC);
            const bodyH = Math.max(2, Math.abs(yC - yO));
            return (
              <g key={`c${i}`}>
                <line x1={x} y1={yFor(c.h)} x2={x} y2={yFor(c.l)} stroke={col} strokeWidth={Math.max(1.5, bodyW * 0.14)} />
                <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={col} rx={1.5} />
              </g>
            );
          })}

          {/* overlays (MA / VWAP polylines) drawn up to the revealed candle */}
          {overlays.map((ov, oi) => {
            const pts = ov.points
              .slice(0, shown)
              .map((p, i) => (p == null ? null : `${xFor(i)},${yFor(p)}`))
              .filter(Boolean)
              .join(" ");
            return <polyline key={`o${oi}`} points={pts} fill="none" stroke={ov.color || accent} strokeWidth={2.5} opacity={0.9} strokeLinejoin="round" />;
          })}

          {/* last-price marker */}
          {shown > 0 && (
            <line x1={padX} y1={yFor(candles[shown - 1].c)} x2={padX + chartW} y2={yFor(candles[shown - 1].c)} stroke="#f8fafc" strokeWidth={1} strokeDasharray="2 6" opacity={0.5} />
          )}
        </svg>

        {/* overlay legend */}
        {overlays.length > 0 && (
          <div style={{ position: "absolute", top: chartTop - Math.round(fontSize * 1.1), left: padX, display: "flex", gap: 20 }}>
            {overlays.map((ov, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 22, height: 4, background: ov.color || accent, borderRadius: 2 }} />
                <span style={{ fontFamily: mono, fontSize: Math.round(fontSize * 0.48), color: "rgba(226,232,240,0.7)" }}>{ov.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Callout — the only on-screen "caption": short key words/numbers, no blocking box. */}
        {callout ? (
          <div
            style={{
              position: "absolute", left: 0, right: 0, bottom: portrait ? H * 0.09 : H * 0.07,
              display: "flex", justifyContent: "center", padding: "0 6%",
              opacity: interpolate(frame, [6, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              transform: `translateY(${(1 - interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) * 22}px)`,
            }}
          >
            <div
              style={{
                fontFamily: sans, fontWeight: 800, fontSize: Math.round(fontSize * 1.2), color: "#f8fafc",
                textAlign: "center", lineHeight: 1.22, letterSpacing: "-0.5px",
                textShadow: "0 2px 16px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.95)",
              }}
            >
              {callout}
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
