import React from "react";
import { AbsoluteFill } from "remotion";
import type { Rng } from "../engine/rng";
import type { TimedBeat, TimedWord } from "../engine/types";
import { alpha, type Theme } from "../engine/theme";

/** Every primitive gets its beat (timing, words, props) and a seeded RNG for variation. */
export type PrimitiveProps = { beat: TimedBeat; rng: Rng };

/** Typed prop getter with a fallback (the LLM may omit or mis-type props — never crash). */
export function prop<T>(beat: TimedBeat, key: string, fallback: T): T {
  const v = beat.props?.[key];
  if (v === undefined || v === null) return fallback;
  if (Array.isArray(fallback) && !Array.isArray(v)) return fallback;
  if (typeof fallback === "number" && typeof v !== "number") {
    const n = Number(v);
    return (Number.isFinite(n) ? n : fallback) as T;
  }
  return v as T;
}

/** Words with sequence-local timing. */
export const localWords = (beat: TimedBeat): (TimedWord & { at: number })[] =>
  beat.words.map((w) => ({ ...w, at: w.from - beat.from }));

/** Strip punctuation for display matching. */
export const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%]/g, "");

/** Content area inside Instagram's safe zone (UI covers top ~10%, bottom ~20%, right rail), ending ABOVE the caption band (~1320-1520px) so content and karaoke captions never collide. */
export const Safe: React.FC<{ children: React.ReactNode; align?: "center" | "start"; style?: React.CSSProperties }> = ({ children, align = "center", style }) => (
  <AbsoluteFill style={{ padding: "220px 84px 560px 84px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: align === "center" ? "center" : "flex-start", ...style }}>
    {children}
  </AbsoluteFill>
);

/** macOS-style window chrome for terminals / editors / browser mockups. */
export const WindowChrome: React.FC<{ theme: Theme; title: string; width: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ theme, title, width, children, style }) => (
  <div style={{ width, borderRadius: 26, overflow: "hidden", background: "#0E0F12", border: `1.5px solid ${alpha("#FFFFFF", 0.1)}`, boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 60px ${alpha(theme.accent, 0.22)}`, ...style }}>
    <div style={{ height: 64, display: "flex", alignItems: "center", gap: 12, padding: "0 24px", background: "#17181C", borderBottom: `1px solid ${alpha("#FFFFFF", 0.06)}` }}>
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
        <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />
      ))}
      <div style={{ flex: 1, textAlign: "center", marginRight: 66, color: "#8B8D94", fontFamily: theme.body, fontWeight: 600, fontSize: 24 }}>{title}</div>
    </div>
    {children}
  </div>
);

export const pickVariant = <T,>(beat: TimedBeat, rng: Rng, key: string, options: readonly T[]): T => {
  const v = beat.props?.[key];
  return (options as readonly unknown[]).includes(v) ? (v as T) : rng.pick(options);
};
