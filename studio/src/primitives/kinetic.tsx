import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { localWords, prop, Safe, type PrimitiveProps } from "./common";

const FLAP = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$%!?-";

/* ─────────────────────────── SPLIT-FLAP ───────────────────────────
 * Airport departure board: every cell flips through characters and lands on the word. */
export const SplitFlap: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const rows = prop<string[]>(beat, "rows", beat.text.toUpperCase().replace(/[^A-Z0-9$%!? ]/g, "").split(/\s+/).reduce<string[]>((acc, w) => {
    const last = acc[acc.length - 1];
    if (last !== undefined && (last + " " + w).length <= 9) acc[acc.length - 1] = last + " " + w;
    else acc.push(w);
    return acc;
  }, []).slice(0, 4));
  // Rows longer than the board wrap word-by-word onto the next row (never chopped mid-word).
  const wrapped = rows.flatMap((r) => r.toUpperCase().split(/\s+/).reduce<string[]>((acc, w) => {
    const last = acc[acc.length - 1];
    if (last !== undefined && (last + " " + w).length <= 10) acc[acc.length - 1] = last + " " + w;
    else acc.push(w.slice(0, 10));
    return acc;
  }, [])).slice(0, 5);
  rows.splice(0, rows.length, ...wrapped);
  const width = Math.min(10, Math.max(...rows.map((r) => r.length)));
  const cell = Math.floor(880 / width) - 10;
  return (
    <Safe>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {rows.map((r, ri) => (
          <div key={ri} style={{ display: "flex", gap: 10 }}>
            {r.toUpperCase().padEnd(width, " ").slice(0, width).split("").map((ch, ci) => {
              const settle = 6 + ri * 5 + ci * 2 + Math.floor(hash01(ri, ci) * 6);
              const flipping = frame < settle;
              const shown = flipping ? FLAP[Math.floor(hash01(ri, ci, frame) * FLAP.length)] : ch;
              const flipPhase = flipping ? (frame % 2) : 0;
              return (
                <div key={ci} style={{ width: cell, height: cell * 1.35, borderRadius: 10, background: "#141416", position: "relative", overflow: "hidden", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.06), 0 10px 20px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.mono, fontWeight: 700, fontSize: cell * 0.95, color: !flipping && ch !== " " && ri === 0 ? theme.accent : "#F4F4F5", transform: `scaleY(${flipPhase ? 0.86 : 1})` }}>
                  {shown}
                  <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 3, background: "rgba(0,0,0,0.7)" }} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── TAPE ───────────────────────────
 * Two crossing caution-tape marquees scroll in opposite directions; the hero word sits between. */
export const Tape: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const tape = prop(beat, "tape", "BUILD IN PUBLIC");
  const word = prop(beat, "word", beat.text);
  const s = pop(frame, fps, 6, "slam");
  const band = (dir: number, rot: number, top: string, inv: boolean) => (
    <div style={{ position: "absolute", left: -300, right: -300, top, height: 120, transform: `rotate(${rot}deg)`, background: inv ? theme.ink : theme.accent, display: "flex", alignItems: "center", overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.45)" }}>
      <div style={{ whiteSpace: "nowrap", transform: `translateX(${dir * ((frame * 9) % 1200) - 1200}px)`, fontFamily: theme.display, fontWeight: 900, fontSize: 76, letterSpacing: 2, color: inv ? theme.bg : theme.onAccent, textTransform: "uppercase" }}>
        {Array.from({ length: 12 }, () => `${tape} ✦ `).join("")}
      </div>
    </div>
  );
  return (
    <AbsoluteFill>
      {band(1, -8, "30%", false)}
      {band(-1, 7, "62%", true)}
      <Safe>
        <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: 130, lineHeight: 0.95, textAlign: "center", color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none", padding: "20px 40px", background: alpha(theme.bg, 0.92), borderRadius: 20, transform: `scale(${interpolate(s, [0, 1], [1.8, 1])})`, opacity: Math.min(1, s * 1.5), zIndex: 3 }}>{word}</div>
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── QUOTE ───────────────────────────
 * Giant quote marks swing in; the quote reveals word-by-word in sync with speech; author tag. */
export const Quote: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const author = prop(beat, "author", "");
  const words = localWords(beat);
  const m = pop(frame, fps, 0, "slam");
  return (
    <Safe align="start">
      <div style={{ fontFamily: "Georgia, serif", fontSize: 340, lineHeight: 0.6, height: 170, color: theme.accent, transform: `rotate(${(1 - m) * -40}deg) scale(${m})`, transformOrigin: "left bottom" }}>“</div>
      <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 66, lineHeight: 1.18, color: theme.ink, display: "flex", flexWrap: "wrap", gap: "0 18px", maxWidth: 900 }}>
        {words.map((w, i) => {
          const o = easeOut(frame, w.at - 2, 6);
          return <span key={i} style={{ opacity: 0.15 + o * 0.85, color: w.emphasis && o > 0.5 ? theme.accent : theme.ink, transform: `translateY(${(1 - o) * 14}px)`, display: "inline-block" }}>{w.w}</span>;
        })}
      </div>
      {author ? <div style={{ marginTop: 44, fontFamily: theme.mono, fontSize: 34, fontWeight: 700, color: theme.dim, letterSpacing: 2, opacity: easeOut(frame, beat.frames * 0.6, 10) }}>— {author}</div> : null}
    </Safe>
  );
};

/* ─────────────────────────── ROADMAP ───────────────────────────
 * Vertical path draws downward; a glowing dot travels it; each milestone lights as it passes. */
export const Roadmap: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const steps = prop<string[]>(beat, "steps", ["Idea", "Build", "Ship", "Scale"]);
  const done = prop(beat, "done", steps.length);
  const gap = 230;
  const h = (steps.length - 1) * gap;
  const p = easeInOut(frame, 4, Math.max(16, beat.frames * 0.75));
  const head = p * h;
  return (
    <Safe>
      <div style={{ position: "relative", width: 820, height: h + 80 }}>
        <div style={{ position: "absolute", left: 58, top: 40, width: 6, height: h, background: alpha(theme.ink, 0.12), borderRadius: 3 }} />
        <div style={{ position: "absolute", left: 58, top: 40, width: 6, height: head, background: theme.accent, borderRadius: 3, boxShadow: `0 0 20px ${theme.accent}` }} />
        <div style={{ position: "absolute", left: 61 - 22, top: 40 + head - 22, width: 44, height: 44, borderRadius: 22, background: theme.accent, boxShadow: `0 0 40px 10px ${alpha(theme.accent, 0.6)}` }} />
        {steps.map((st, i) => {
          const y = i * gap;
          const lit = head >= y - 2 && i < done;
          const o = lit ? 1 : 0.32;
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: y, display: "flex", alignItems: "center", gap: 40 }}>
              <div style={{ width: 124, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 34, height: 34, borderRadius: 17, border: `5px solid ${lit ? theme.accent : alpha(theme.ink, 0.25)}`, background: lit ? theme.bg : "transparent" }} />
              </div>
              <div style={{ opacity: o, transform: `translateX(${lit ? 0 : 20}px)` }}>
                <div style={{ fontFamily: theme.mono, fontSize: 26, fontWeight: 700, color: theme.accent, letterSpacing: 4 }}>STEP {String(i + 1).padStart(2, "0")}</div>
                <div style={{ fontFamily: theme.body, fontSize: 58, fontWeight: 900, color: theme.ink }}>{st}{i >= done ? <span style={{ color: theme.dim, fontSize: 32 }}>  · soon</span> : null}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── BURST ───────────────────────────
 * Word slams in centre; a ring of particles/emoji explode outward with gravity. Celebration beat. */
export const Burst: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const word = prop(beat, "word", beat.text);
  const glyphs = prop<string[]>(beat, "glyphs", ["✦", "●", "▲", "■"]);
  const s = pop(frame, fps, 2, "slam");
  const t = Math.max(0, frame - 3);
  const N = 36;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {Array.from({ length: N }, (_, i) => {
          const a = (i / N) * Math.PI * 2 + hash01(i) * 0.4;
          const v = 26 + hash01(i, 1) * 30;
          const x = Math.cos(a) * v * t * (1 - t / 140);
          const y = Math.sin(a) * v * t * (1 - t / 140) + 0.35 * t * t;
          const o = interpolate(t, [0, 4, 34], [0, 1, 0], { extrapolateRight: "clamp" });
          const g = glyphs[i % glyphs.length];
          return <div key={i} style={{ position: "absolute", transform: `translate(${x}px, ${y - 60}px) rotate(${t * (hash01(i, 2) - 0.5) * 30}deg)`, opacity: o, fontSize: 30 + hash01(i, 3) * 40, color: i % 3 === 0 ? theme.ink : theme.accent }}>{g}</div>;
        })}
      </AbsoluteFill>
      <Safe>
        <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: 150, lineHeight: 0.92, textAlign: "center", color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none", transform: `scale(${interpolate(s, [0, 1], [0.2, 1])}) rotate(${(1 - s) * 12}deg)`, textShadow: `0 0 60px ${alpha(theme.accent, 0.6)}` }}>{word}</div>
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── TIER LIST ───────────────────────────
 * S/A/B/C rows; items fly into their tier one by one. Opinion content gold. */
type TierItem = { name: string; tier: string };
const TIER_COLORS: Record<string, number> = { S: 1, A: 0.75, B: 0.5, C: 0.3, D: 0.18 };
export const TierList: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const items = prop<TierItem[]>(beat, "items", [{ name: "Remotion", tier: "S" }, { name: "Agencies", tier: "C" }]);
  const tiers = prop<string[]>(beat, "tiers", ["S", "A", "B", "C"]);
  const step = Math.max(6, Math.floor((beat.frames * 0.75) / Math.max(1, items.length)));
  return (
    <Safe>
      <div style={{ width: 920, display: "flex", flexDirection: "column", gap: 12 }}>
        {tiers.map((tier) => (
          <div key={tier} style={{ display: "flex", minHeight: 150, borderRadius: 18, overflow: "hidden", background: alpha(theme.ink, 0.05) }}>
            <div style={{ width: 150, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: alpha(theme.accent, TIER_COLORS[tier] ?? 0.3), fontFamily: theme.display, fontWeight: 900, fontSize: 84, color: theme.onAccent }}>{tier}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 16, alignItems: "center" }}>
              {items.map((it, i) => {
                if (it.tier !== tier) return null;
                const at = 4 + i * step;
                if (frame < at) return null;
                const s = pop(frame, fps, at, "snap");
                return <div key={i} style={{ padding: "18px 26px", borderRadius: 14, background: theme.ink, color: theme.bg, fontFamily: theme.body, fontWeight: 900, fontSize: 36, transform: `translateY(${(1 - s) * -400}px) scale(${interpolate(s, [0, 1], [1.4, 1])}) rotate(${(1 - s) * 10}deg)` }}>{it.name}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </Safe>
  );
};
