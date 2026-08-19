import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * CANDLESTICK CHART — a real, data-driven trading chart for the daily Gold/Bitcoin analysis reels.
 * Candles draw in left→right, moving-average / VWAP overlays trace over them, and support/resistance
 * lines fade in with labels. All values come from real market data (lib_market.mjs) — nothing invented.
 */

export type Candle = { o: number; h: number; l: number; c: number; v?: number };
export type Overlay = { label: string; color?: string; points: (number | null)[] };
export type Level = { price: number; label: string; kind?: "support" | "resistance" | "level" };

const sans = 'system-ui, "Segoe UI", Roboto, sans-serif';
const mono = '"SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace';
const UP = "#16c784";
const DOWN = "#ea3943";

const Scrim: React.FC<{ bg?: [string, string, string] | null }> = ({ bg }) => {
  const c = bg && bg.length === 3 ? bg : ["#0d1622", "#060a12", "#04070c"];
  return <AbsoluteFill style={{ background: `radial-gradient(120% 100% at 50% 0%, ${c[0]} 0%, ${c[1]} 70%, ${c[2]} 100%)` }} />;
};

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
  dateLabel?: string | null; // the analysis date, so viewers know when it's from
  decision?: {
    hero: number;               // the ONE "line in the sand"
    side?: string;
    sideText?: string;          // "hold above" / "reclaim"
    bull?: { target: number };  // above the line → bulls run it here
    bear?: { target: number };  // below the line → bears flush it here
  } | null;
  bg?: [string, string, string] | null; // per-reel rotating background tint
  still?: boolean; // static render (carousel slide) — show everything, no frame animation
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ candles, overlays = [], levels = [], name, pair, timeframe, price, changePct, decimals, callout, dateLabel, decision, bg, still, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = still ? 1 : frame > durationInFrames - 12 ? fadeOut : fadeIn;

  const n = Math.max(candles.length, 1);
  // Candles reveal progressively across the first ~65% of the scene (all shown at once when `still`).
  const revealEnd = Math.max(9, durationInFrames * 0.65);
  const shown = still ? n : Math.max(1, Math.floor(interpolate(frame, [8, revealEnd], [1, n], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));

  // Chart geometry (inside the SVG viewBox = pixel space). Pulled up to use the space, with a thin
  // volume band reserved at the base of the price pane.
  const W = width;
  const H = height;
  const padX = W * 0.06;
  const chartTop = portrait ? H * 0.235 : H * 0.24;
  const chartBottom = portrait ? H * 0.83 : H * 0.86;
  const chartH = chartBottom - chartTop;
  const volH = chartH * 0.15; // subtle volume histogram along the base
  const priceBottom = chartBottom - volH;
  const priceH = priceBottom - chartTop;
  const chartW = W - padX * 2 - (portrait ? 150 : 190); // leave room for the right-side price axis

  // Decision-map prices must be inside the visible range so the hero line + bull/bear zones show.
  const decPrices = decision
    ? [decision.hero, decision.bull?.target, decision.bear?.target].filter((v): v is number => v != null)
    : [];
  const allHi = Math.max(...candles.map((c) => c.h), ...levels.map((l) => l.price), ...decPrices);
  const allLo = Math.min(...candles.map((c) => c.l), ...levels.map((l) => l.price), ...decPrices);
  const pad = (allHi - allLo) * 0.08 || 1;
  const hi = allHi + pad, lo = allLo - pad;

  const yFor = (p: number) => chartTop + ((hi - p) / (hi - lo)) * priceH;
  const slot = chartW / n;
  const xFor = (i: number) => padX + slot * (i + 0.5);
  const bodyW = Math.max(2, slot * 0.62);
  const maxVol = Math.max(...candles.slice(0, shown).map((c) => c.v || 0), 1);

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
      <Scrim bg={bg} />
      {/* accent hairline — a small per-reel signature that rotates colour with the theme */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, ${accent}, transparent 75%)`, opacity: 0.85 }} />
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
            {dateLabel ? (
              <div style={{ fontFamily: mono, fontWeight: 600, fontSize: Math.round(fontSize * 0.5), color: accent, marginTop: 6, letterSpacing: "1px" }}>
                {dateLabel}
              </div>
            ) : null}
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

          {/* support / resistance as soft ZONES (band + faint centre line), label staggered */}
          {leveled.map((lv, i) => {
            const o = still ? 1 : interpolate(frame, [20 + i * 4, 32 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const col = levelColor(lv.kind);
            const bandH = Math.max(8, Math.round(fontSize * 0.5));
            return (
              <g key={`lv${i}`} opacity={o}>
                <rect x={padX} y={lv.y - bandH / 2} width={chartW} height={bandH} fill={col} opacity={0.09} />
                <line x1={padX} y1={lv.y} x2={padX + chartW} y2={lv.y} stroke={col} strokeWidth={1.5} strokeDasharray="9 9" opacity={0.55} />
                <rect x={padX + 8} y={lv.labelY - Math.round(fontSize * 0.5)} width={Math.round(fontSize * (lv.label.length * 0.34 + 1.4))} height={Math.round(fontSize * 0.78)} rx={4} fill={col} opacity={0.22} />
                <text x={padX + 16} y={lv.labelY + 5} fill={col} fontFamily={mono} fontSize={Math.round(fontSize * 0.5)} fontWeight={700}>
                  {lv.label}
                </text>
              </g>
            );
          })}

          {/* candles (progressive reveal) + a subtle volume bar under each */}
          {candles.slice(0, shown).map((c, i) => {
            const x = xFor(i);
            const up = c.c >= c.o;
            const col = up ? UP : DOWN;
            const yO = yFor(c.o), yC = yFor(c.c);
            const bodyTop = Math.min(yO, yC);
            const bodyH = Math.max(2, Math.abs(yC - yO));
            const vh = ((c.v || 0) / maxVol) * volH * 0.92;
            return (
              <g key={`c${i}`}>
                {vh > 0 ? <rect x={x - bodyW / 2} y={chartBottom - vh} width={bodyW} height={vh} fill={col} opacity={0.28} /> : null}
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

          {/* DECISION MAP — the money slide: one hero line + a drawn bull path (green, up) and bear path
              (red, down). Traders screenshot decision maps; this is the save-rate lever. */}
          {decision ? (() => {
            const dOpacity = still ? 1 : interpolate(frame, [16, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const heroY = yFor(decision.hero);
            const bullT = decision.bull?.target;
            const bearT = decision.bear?.target;
            const bullY = bullT != null ? yFor(bullT) : chartTop;
            const bearY = bearT != null ? yFor(bearT) : priceBottom;
            const lab = Math.round(fontSize * 0.56);
            const pillTxt = `LINE ${fmt(decision.hero, decimals)}`;
            const pillW = Math.round(fontSize * (pillTxt.length * 0.6 + 2.4));
            const pillH = Math.round(fontSize * 1.5);
            return (
              <g opacity={dOpacity}>
                {/* bull zone (hero → bull target) */}
                <rect x={padX} y={Math.min(heroY, bullY)} width={chartW} height={Math.abs(heroY - bullY)} fill={UP} opacity={0.14} />
                {/* bear zone (hero → bear target) */}
                <rect x={padX} y={Math.min(heroY, bearY)} width={chartW} height={Math.abs(heroY - bearY)} fill={DOWN} opacity={0.14} />
                {/* target lines */}
                {bullT != null ? <line x1={padX} y1={bullY} x2={padX + chartW} y2={bullY} stroke={UP} strokeWidth={2} strokeDasharray="7 8" opacity={0.75} /> : null}
                {bearT != null ? <line x1={padX} y1={bearY} x2={padX + chartW} y2={bearY} stroke={DOWN} strokeWidth={2} strokeDasharray="7 8" opacity={0.75} /> : null}
                {/* target labels */}
                {bullT != null ? (
                  <text x={padX + chartW - 10} y={bullY + lab + 6} textAnchor="end" fill={UP} fontFamily={mono} fontWeight={800} fontSize={lab}>
                    ▲ BULLS → {fmt(bullT, decimals)}
                  </text>
                ) : null}
                {bearT != null ? (
                  <text x={padX + chartW - 10} y={bearY - 8} textAnchor="end" fill={DOWN} fontFamily={mono} fontWeight={800} fontSize={lab}>
                    ▼ BEARS → {fmt(bearT, decimals)}
                  </text>
                ) : null}
                {/* hero "line in the sand" — bold + a centered pill */}
                <line x1={padX} y1={heroY} x2={padX + chartW} y2={heroY} stroke={accent} strokeWidth={3.5} opacity={0.95} />
                <rect x={padX + chartW / 2 - pillW / 2} y={heroY - pillH / 2} width={pillW} height={pillH} rx={7} fill={accent} />
                <text x={padX + chartW / 2} y={heroY + Math.round(fontSize * 0.2)} textAnchor="middle" fill="#04070c" fontFamily={mono} fontWeight={800} fontSize={Math.round(fontSize * 0.62)}>
                  {pillTxt}
                </text>
              </g>
            );
          })() : null}

          {/* current-price line + a solid price tag on the axis */}
          <g>
            <line x1={padX} y1={yFor(price)} x2={padX + chartW} y2={yFor(price)} stroke="#f8fafc" strokeWidth={1} strokeDasharray="2 6" opacity={0.45} />
            <rect x={padX + chartW + 6} y={yFor(price) - Math.round(fontSize * 0.44)} width={Math.round(fontSize * (fmt(price, decimals).length * 0.32 + 1))} height={Math.round(fontSize * 0.88)} rx={4} fill={changeColor} />
            <text x={padX + chartW + 14} y={yFor(price) + 5} fill="#04070c" fontFamily={mono} fontWeight={800} fontSize={Math.round(fontSize * 0.5)}>
              {fmt(price, decimals)}
            </text>
          </g>
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
              opacity: still ? 1 : interpolate(frame, [6, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              transform: still ? "none" : `translateY(${(1 - interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) * 22}px)`,
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
