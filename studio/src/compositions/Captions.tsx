import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { resolvePrimitive } from "../engine/registry";
import type { TimedWord } from "../engine/types";

type Chunk = { words: TimedWord[]; from: number; to: number; beat: number };

/** 2–3 word chunks, broken early on punctuation — the fast "CapCut" read Gen-Z expects. */
const chunkWords = (words: TimedWord[]): Chunk[] => {
  const out: Chunk[] = [];
  let cur: TimedWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ words: cur, from: cur[0].from, to: cur[cur.length - 1].to, beat: cur[0].beat });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && (cur[0].beat !== w.beat || cur.length >= 3)) flush();
    cur.push(w);
    if (/[.,!?;:—]$/.test(w.w)) flush();
  }
  flush();
  // Hold each chunk until the next one starts (no flicker gaps), capped so silence clears the screen.
  return out.map((c, i) => ({ ...c, to: Math.min(out[i + 1]?.from ?? c.to + 12, c.to + 12) }));
};

/**
 * KARAOKE CAPTIONS — one global layer over every beat. Each chunk pops in; the word being spoken
 * gets the accent box. Hidden automatically on beats whose primitive already shows the words.
 */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, timeline } = useRender();
  const chunks = useMemo(() => chunkWords(timeline.words), [timeline.words]);
  const chunk = chunks.find((c) => frame >= c.from && frame < c.to);
  if (!chunk) return null;
  const beat = timeline.beats[chunk.beat];
  if (!beat || resolvePrimitive(beat.primitive).meta.showsText) return null;
  // A photo beat with no image renders a generative hero-word scene → it already shows the text.
  if (beat.primitive === "photo" && !beat.props?.src) return null;
  const s = spring({ frame: frame - chunk.from, fps, config: { damping: 14, stiffness: 260, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 400, pointerEvents: "none" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 18px", maxWidth: 940, transform: `scale(${interpolate(s, [0, 1], [0.7, 1])}) translateY(${(1 - s) * 30}px)`, opacity: Math.min(1, s * 2) }}>
        {chunk.words.map((w, i) => {
          const active = frame >= w.from && frame < (chunk.words[i + 1]?.from ?? chunk.to);
          const said = frame >= w.from;
          const hot = active || (w.emphasis && said);
          return (
            <span key={i} style={{ fontFamily: theme.body, fontWeight: 900, fontSize: 88, lineHeight: 1.12, textTransform: "uppercase", letterSpacing: -1, padding: "2px 16px", borderRadius: 14, color: hot ? theme.onAccent : said ? theme.ink : alpha(theme.ink, 0.55), background: hot ? (w.emphasis ? theme.accent : alpha(theme.accent, 0.9)) : "transparent", transform: active ? "scale(1.08) rotate(-1.5deg)" : "none", textShadow: hot ? "none" : "0 4px 0 rgba(0,0,0,0.55), 0 0 24px rgba(0,0,0,0.6)", WebkitTextStroke: hot ? "0" : `2px ${alpha("#000000", 0.5)}` }}>
              {w.w.replace(/[*_#]/g, "")}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
