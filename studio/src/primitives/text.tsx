import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeOut, fitSize, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { tokenize } from "../engine/timeline";
import { bare, localWords, prop, Safe, type PrimitiveProps } from "./common";

const upper = (s: string, on: boolean) => (on ? s.toUpperCase() : s);

/* ─────────────────────────── STOMP ───────────────────────────
 * Giant words slam in ON the spoken syllable, emphasis word gets a skewed accent block + echo. */
export const Stomp: React.FC<PrimitiveProps> = ({ beat, rng }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const text = prop(beat, "text", beat.text);
  const toks = tokenize(text);
  const spoken = localWords(beat);
  const emph = new Set(beat.words.filter((w) => w.emphasis).map((w) => bare(w.w)));
  const stack = toks.length <= 4;
  const size = fitSize(toks, 900, stack ? 300 : 170, 96, theme.displayUpper ? 0.5 : 0.62);
  const tiltBase = rng.range(2, 6) * rng.sign();
  return (
    <Safe>
      <div style={{ display: "flex", flexDirection: stack ? "column" : "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: stack ? 0 : "0 26px", lineHeight: 0.9 }}>
        {toks.map((t, i) => {
          const at = spoken[i]?.at ?? i * 4;
          const s = pop(frame, fps, at, "slam");
          const isE = emph.has(bare(t));
          const block = easeOut(frame, at + 2, 8);
          return (
            <div key={i} style={{ position: "relative", opacity: Math.min(1, s * 1.4), transform: `scale(${interpolate(s, [0, 1], [2.3, 1])}) rotate(${interpolate(s, [0, 1], [tiltBase * 2, isE ? -2 : 0])}deg)`, margin: stack ? "6px 0" : 0 }}>
              {isE ? (
                <>
                  <div style={{ position: "absolute", inset: "-2% -6%", background: theme.accent, transform: `skewX(-8deg) scaleX(${block})`, transformOrigin: "left center", boxShadow: `0 0 50px ${alpha(theme.accent, 0.6)}` }} />
                  <div style={{ position: "absolute", left: 0, right: 0, top: 0, textAlign: "center", fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size * 1.45, color: "transparent", WebkitTextStroke: `2px ${alpha(theme.accent, 0.35)}`, transform: `translateY(-14%) scale(${1 + (1 - s) * 0.3})`, opacity: 0.6, whiteSpace: "nowrap" }}>{upper(t, theme.displayUpper)}</div>
                </>
              ) : null}
              <div style={{ position: "relative", fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size, letterSpacing: theme.displayUpper ? 1 : -3, color: isE ? theme.onAccent : theme.ink, textShadow: isE ? "none" : `0 10px 0 ${alpha("#000", theme.dark ? 0.45 : 0.12)}`, whiteSpace: "nowrap", padding: isE ? "0 10px" : 0 }}>
                {upper(t, theme.displayUpper)}
              </div>
            </div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── MASK REVEAL ───────────────────────────
 * Editorial lines slide up out of hard masks, staggered to the voice. Accent rule grows on the left. */
export const MaskReveal: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const text = prop(beat, "text", beat.text);
  const kicker = prop(beat, "kicker", "");
  const toks = tokenize(text);
  const per = toks.length > 9 ? 4 : 3;
  const lines: string[][] = [];
  for (let i = 0; i < toks.length; i += per) lines.push(toks.slice(i, i + per));
  const spoken = localWords(beat);
  const emph = new Set(beat.words.filter((w) => w.emphasis).map((w) => bare(w.w)));
  const size = toks.length > 10 ? 84 : 104;
  const rule = easeOut(frame, 0, 18);
  let idx = 0;
  return (
    <Safe align="start">
      <div style={{ display: "flex", gap: 34 }}>
        <div style={{ width: 10, borderRadius: 5, background: theme.accent, transform: `scaleY(${rule})`, transformOrigin: "top", boxShadow: `0 0 24px ${alpha(theme.accent, 0.6)}` }} />
        <div>
          {kicker ? (
            <div style={{ fontFamily: theme.mono, fontSize: 30, letterSpacing: 6, color: theme.accent, marginBottom: 22, opacity: easeOut(frame, 0, 10), textTransform: "uppercase" }}>{kicker}</div>
          ) : null}
          {lines.map((ln, li) => {
            const start = spoken[idx]?.at ?? li * 6;
            idx += ln.length;
            const p = easeOut(frame, start - 2, 14);
            return (
              <div key={li} style={{ overflow: "hidden", paddingBottom: 8 }}>
                <div style={{ transform: `translateY(${(1 - p) * 115}%)`, fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size, lineHeight: 1.04, letterSpacing: theme.displayUpper ? 1 : -2, color: theme.ink }}>
                  {ln.map((w, k) => (
                    <span key={k} style={{ color: emph.has(bare(w)) ? theme.accent : theme.ink }}>{upper(w, theme.displayUpper)}{k < ln.length - 1 ? " " : ""}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── DECODE ───────────────────────────
 * Hacker-style: every character scrambles through glyphs and locks in left-to-right. */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*<>/\\{}[]=+";
export const Decode: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const text = prop(beat, "text", beat.text).toUpperCase();
  const chars = [...text];
  const lockSpan = Math.max(12, beat.frames * 0.55);
  const per = lockSpan / Math.max(1, chars.length);
  const size = fitSize(tokenize(text), 900, 120, 56, 0.62);
  const lockedCount = Math.floor((frame - 4) / per);
  return (
    <Safe>
      <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: size, lineHeight: 1.12, color: theme.ink, textAlign: "center", maxWidth: 920, wordBreak: "break-word" }}>
        {chars.map((c, i) => {
          if (c === " ") return <span key={i}> </span>;
          const locked = i < lockedCount;
          const front = i === lockedCount;
          const g = GLYPHS[Math.floor(hash01(Math.floor(frame / 2), i) * GLYPHS.length)];
          const shown = frame < 4 + i * per * 0.25 ? "" : locked ? c : g;
          return (
            <span key={i} style={{ color: locked ? theme.ink : front ? theme.accent : alpha(theme.accent, 0.55), textShadow: front ? `0 0 18px ${theme.accent}` : "none" }}>{shown || " "}</span>
          );
        })}
        <span style={{ display: "inline-block", width: size * 0.5, height: size * 0.85, marginLeft: 6, verticalAlign: "-8%", background: theme.accent, opacity: Math.floor(frame / 8) % 2 ? 1 : 0.15 }} />
      </div>
    </Safe>
  );
};

/* ─────────────────────────── HIGHLIGHT ───────────────────────────
 * A full sentence; each emphasis word gets a marker swipe exactly when it's spoken. */
export const Highlight: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const text = prop(beat, "text", beat.text);
  const toks = tokenize(text);
  const spoken = localWords(beat);
  const emph = new Set(beat.words.filter((w) => w.emphasis).map((w) => bare(w.w)));
  const size = toks.length > 12 ? 74 : 90;
  return (
    <Safe align="start">
      <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: size, lineHeight: 1.22, letterSpacing: -1.5, color: theme.ink, maxWidth: 920 }}>
        {toks.map((t, i) => {
          const at = spoken[i]?.at ?? i * 3;
          const appear = easeOut(frame, at - 3, 6);
          const isE = emph.has(bare(t));
          const swipe = isE ? easeOut(frame, at, 9) : 0;
          return (
            <span key={i} style={{ position: "relative", display: "inline-block", marginRight: size * 0.26, opacity: 0.2 + appear * 0.8, transform: `translateY(${(1 - appear) * 12}px)` }}>
              {isE ? <span style={{ position: "absolute", left: -8, right: -8, top: "14%", bottom: "6%", background: theme.accent, transform: `skewX(-10deg) scaleX(${swipe})`, transformOrigin: "left", borderRadius: 6 }} /> : null}
              <span style={{ position: "relative", color: isE && swipe > 0.5 ? theme.onAccent : theme.ink }}>{t}</span>
            </span>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── COUNTER (odometer) ───────────────────────────
 * Real rolling digit columns — every place value spins continuously to the final number. */
export const Counter: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const from = prop(beat, "from", 0);
  const to = prop(beat, "to", 100);
  const prefix = prop(beat, "prefix", "");
  const suffix = prop(beat, "suffix", "");
  const label = prop(beat, "label", "");
  const p = easeOut(frame, 3, Math.max(14, beat.frames * 0.62));
  const v = from + (to - from) * p;
  const digits = Math.max(1, Math.floor(Math.log10(Math.max(1, Math.abs(to)))) + 1);
  const size = digits > 6 ? 150 : digits > 4 ? 190 : 240;
  const cols: React.ReactNode[] = [];
  for (let place = digits - 1; place >= 0; place--) {
    const dv = (Math.abs(v) / Math.pow(10, place)) % 10;
    cols.push(
      <div key={place} style={{ height: size * 1.05, overflow: "hidden", width: size * 0.66 }}>
        <div style={{ transform: `translateY(${-dv * size * 1.05}px)` }}>
          {Array.from({ length: 11 }, (_, n) => (
            <div key={n} style={{ height: size * 1.05, lineHeight: `${size * 1.05}px`, textAlign: "center" }}>{n % 10}</div>
          ))}
        </div>
      </div>,
    );
    if (place % 3 === 0 && place !== 0) cols.push(<div key={`c${place}`} style={{ width: size * 0.22, textAlign: "center" }}>,</div>);
  }
  const glow = interpolate(p, [0.8, 1], [0, 1], { extrapolateLeft: "clamp" });
  return (
    <Safe>
      <div style={{ display: "flex", alignItems: "center", fontFamily: theme.mono, fontWeight: 700, fontSize: size, color: theme.accent, textShadow: `0 0 ${30 + glow * 40}px ${alpha(theme.accent, 0.5 + glow * 0.3)}` }}>
        {prefix ? <div style={{ fontSize: size * 0.55, marginRight: 8, color: theme.ink }}>{prefix}</div> : null}
        {cols}
        {suffix ? <div style={{ fontSize: size * 0.45, marginLeft: 10, color: theme.ink }}>{suffix}</div> : null}
      </div>
      {label ? <div style={{ marginTop: 28, fontFamily: theme.body, fontWeight: 800, fontSize: 46, letterSpacing: 4, color: theme.dim, textTransform: "uppercase", opacity: easeOut(frame, 6, 10) }}>{label}</div> : null}
    </Safe>
  );
};

/* ─────────────────────────── STRIKE → SWAP ───────────────────────────
 * "Not X." gets struck through on the beat, then the real answer slams in. */
export const Strike: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const wrong = prop(beat, "wrong", "Hard work");
  const right = prop(beat, "right", "Systems");
  const cut = Math.round(beat.frames * 0.38);
  const line = easeOut(frame, cut, 7);
  const r = pop(frame, fps, cut + 6, "slam");
  const wrongIn = easeOut(frame, 0, 10);
  const size = fitSize(tokenize(`${wrong} ${right}`), 880, 170, 80, theme.displayUpper ? 0.5 : 0.6);
  return (
    <Safe>
      <div style={{ position: "relative", opacity: wrongIn * interpolate(line, [0, 1], [1, 0.38]), transform: `translateY(${(1 - wrongIn) * 30}px)` }}>
        <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size, color: theme.dim, letterSpacing: theme.displayUpper ? 1 : -2 }}>{upper(wrong, theme.displayUpper)}</div>
        <div style={{ position: "absolute", left: -12, right: -12, top: "50%", height: size * 0.11, background: theme.accent, transform: `scaleX(${line}) rotate(-4deg)`, transformOrigin: "left", borderRadius: 10, boxShadow: `0 0 22px ${alpha(theme.accent, 0.7)}` }} />
      </div>
      <div style={{ marginTop: 34, opacity: r, transform: `scale(${interpolate(r, [0, 1], [2, 1])}) rotate(${interpolate(r, [0, 1], [-8, -2])}deg)` }}>
        <div style={{ background: theme.accent, color: theme.onAccent, padding: `6px ${size * 0.18}px`, fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size * 1.08, letterSpacing: theme.displayUpper ? 1 : -2, boxShadow: `0 20px 60px ${alpha(theme.accent, 0.45)}` }}>{upper(right, theme.displayUpper)}</div>
      </div>
    </Safe>
  );
};
