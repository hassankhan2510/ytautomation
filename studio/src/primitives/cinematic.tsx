import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, fitSize, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { localWords, prop, Safe, type PrimitiveProps } from "./common";

const src = (p: string) => (/^https?:\/\//.test(p) ? p : staticFile(p));

/* ─────────────────────────── FLIP3D ───────────────────────────
 * Each word rotates in on X like a cube face exactly as it's spoken; lines stack. */
export const Flip3D: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const words = localWords(beat);
  const size = fitSize(words.map((w) => w.w), 900, 150, 84, 0.55);
  return (
    <Safe>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.22}px`, perspective: 1200, maxWidth: 940 }}>
        {words.map((w, i) => {
          const s = pop(frame, fps, w.at - 1, "snap");
          return (
            <span key={i} style={{ display: "inline-block", fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size, lineHeight: 1.02, textTransform: theme.displayUpper ? "uppercase" : "none", color: w.emphasis ? theme.accent : theme.ink, transform: `rotateX(${(1 - s) * -100}deg) translateY(${(1 - s) * 40}px)`, transformOrigin: "50% 100%", opacity: frame < w.at - 1 ? 0 : 1, backfaceVisibility: "hidden" }}>{w.w}</span>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── GLITCH TITLE ───────────────────────────
 * Title with RGB channel split, slice displacement bursts and scanlines; snaps clean between bursts. */
export const GlitchTitle: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const text = prop(beat, "title", beat.text);
  const size = fitSize(text.split(/\s+/), 900, 170, 90, 0.56);
  const burst = frame < 8 || (frame % 23 < 3) || (frame % 37 < 2);
  const k = burst ? 1 : 0;
  const sx = (hash01(frame, 1) - 0.5) * 30 * k;
  const slices = [0.18, 0.42, 0.67, 0.84];
  const style: React.CSSProperties = { fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size, lineHeight: 0.95, textAlign: "center", textTransform: theme.displayUpper ? "uppercase" : "none", maxWidth: 940 };
  return (
    <AbsoluteFill>
      <Safe>
        <div style={{ position: "relative" }}>
          <div style={{ ...style, position: "absolute", inset: 0, color: "#FF0040", mixBlendMode: "screen", transform: `translateX(${-8 * k + sx}px)` }}>{text}</div>
          <div style={{ ...style, position: "absolute", inset: 0, color: "#00E5FF", mixBlendMode: "screen", transform: `translateX(${8 * k - sx}px)` }}>{text}</div>
          <div style={{ ...style, color: theme.ink, position: "relative" }}>{text}</div>
          {k ? slices.map((y, i) => (
            <div key={i} style={{ ...style, position: "absolute", inset: 0, color: theme.accent, clipPath: `inset(${y * 100}% 0 ${100 - y * 100 - 6}% 0)`, transform: `translateX(${(hash01(frame, i) - 0.5) * 120}px)` }}>{text}</div>
          )) : null}
        </div>
      </Safe>
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 5px)`, opacity: 0.6, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

/* ─────────────────────────── ZOOM THROUGH ───────────────────────────
 * Camera flies INTO the word (through a letter) and out the other side to reveal the next idea. */
export const ZoomThrough: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const word = prop(beat, "word", beat.text.split(/\s+/)[0] || "GO");
  const reveal = prop(beat, "reveal", beat.text);
  const t = easeInOut(frame, Math.floor(beat.frames * 0.3), Math.floor(beat.frames * 0.4));
  const scale = Math.pow(60, t);
  const after = easeOut(frame, Math.floor(beat.frames * 0.62), 10);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 380, lineHeight: 1, color: theme.ink, textTransform: "uppercase", transform: `scale(${scale})`, opacity: 1 - after, letterSpacing: -10 }}>{word}</div>
      <AbsoluteFill style={{ background: theme.accent, opacity: interpolate(t, [0.7, 0.95, 1], [0, 1, 1], { extrapolateLeft: "clamp" }) * (1 - after) }} />
      <Safe>
        <div style={{ fontFamily: theme.body, fontWeight: 900, fontSize: 90, lineHeight: 1.05, textAlign: "center", color: theme.ink, opacity: after, transform: `scale(${interpolate(after, [0, 1], [0.6, 1])})` }}>{reveal}</div>
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── ORBIT ───────────────────────────
 * Keywords orbit a centre word on a tilted 3D ring (depth-sorted, front ones bigger/brighter). */
export const Orbit: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const center = prop(beat, "center", "YOU");
  const items = prop<string[]>(beat, "items", ["Script", "Voice", "Motion", "Music", "Captions", "Posting"]);
  const s = pop(frame, fps, 0, "smooth");
  const spin = frame * 0.022;
  const nodes = items.map((it, i) => {
    const a = spin + (i / items.length) * Math.PI * 2;
    const z = Math.sin(a);
    return { it, x: Math.cos(a) * 400 * s, y: z * 130 * s, z, i };
  }).sort((p, q) => p.z - q.z);
  const cs = pop(frame, fps, 4, "slam");
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: 820, height: 280, borderRadius: "50%", border: `3px solid ${alpha(theme.accent, 0.35)}`, transform: `scale(${s})` }} />
      {nodes.filter((n) => n.z < 0).map((n) => <OrbitNode key={n.i} {...n} />)}
      <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 170, color: theme.ink, textTransform: "uppercase", transform: `scale(${cs})`, textShadow: `0 0 60px ${alpha(theme.accent, 0.6)}`, zIndex: 5 }}>{center}</div>
      {nodes.filter((n) => n.z >= 0).map((n) => <OrbitNode key={n.i} {...n} />)}
    </AbsoluteFill>
  );
};
const OrbitNode: React.FC<{ it: string; x: number; y: number; z: number }> = ({ it, x, y, z }) => {
  const { theme } = useRender();
  const k = (z + 1) / 2;
  return (
    <div style={{ position: "absolute", transform: `translate(${x}px, ${y}px) scale(${0.65 + k * 0.5})`, opacity: 0.35 + k * 0.65, zIndex: z >= 0 ? 10 : 1, padding: "14px 30px", borderRadius: 999, background: k > 0.6 ? theme.accent : alpha(theme.ink, 0.1), color: k > 0.6 ? theme.onAccent : theme.ink, fontFamily: theme.body, fontWeight: 900, fontSize: 44, whiteSpace: "nowrap", filter: `blur(${(1 - k) * 3}px)` }}>{it}</div>
  );
};

/* ─────────────────────────── CARD FAN ───────────────────────────
 * A deck of cards deals in and fans out; the chosen card lifts forward and flips to accent. */
export const CardFan: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const cards = prop<string[]>(beat, "cards", ["Hooks", "Edits", "Voice", "Posting", "Growth"]);
  const pick = Math.max(0, Math.min(cards.length - 1, prop(beat, "pick", Math.floor(cards.length / 2))));
  const n = cards.length;
  const fan = pop(frame, fps, 8, "smooth");
  const liftAt = Math.floor(beat.frames * 0.5);
  const lift = frame >= liftAt ? pop(frame, fps, liftAt, "snap") : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1600 }}>
      {cards.map((c, i) => {
        const deal = pop(frame, fps, i * 2, "snap");
        const off = i - (n - 1) / 2;
        const chosen = i === pick;
        const rot = off * 12 * fan;
        const x = off * 120 * fan;
        const y = Math.abs(off) * 26 * fan - (chosen ? lift * 260 : 0);
        return (
          <div key={i} style={{ position: "absolute", width: 360, height: 520, borderRadius: 30, transform: `translate(${x}px, ${y + (1 - deal) * 900}px) rotate(${chosen ? rot * (1 - lift) : rot}deg) scale(${chosen ? 1 + lift * 0.25 : 1}) rotateY(${chosen ? lift * 360 : 0}deg)`, transformOrigin: "50% 120%", background: chosen && lift > 0.5 ? theme.accent : theme.dark ? "#16161A" : "#FFFFFF", border: `3px solid ${chosen && lift > 0.5 ? theme.accent : alpha(theme.ink, 0.15)}`, boxShadow: "0 30px 70px rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", padding: 34, zIndex: chosen ? 50 : i, fontFamily: theme.body, fontWeight: 900, fontSize: 52, color: chosen && lift > 0.5 ? theme.onAccent : theme.ink }}>
            <div>
              <div style={{ fontFamily: theme.mono, fontSize: 26, opacity: 0.6, marginBottom: 8 }}>{String(i + 1).padStart(2, "0")}</div>
              {c}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── BEFORE / AFTER ───────────────────────────
 * Two images (or two labelled panels) with a handle that sweeps across, wiping before → after. */
export const BeforeAfter: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const before = prop(beat, "before", "");
  const after = prop(beat, "after", "");
  const beforeLabel = prop(beat, "beforeLabel", "BEFORE");
  const afterLabel = prop(beat, "afterLabel", "AFTER");
  const p = interpolate(easeInOut(frame, 6, Math.max(16, beat.frames * 0.6)), [0, 1], [0.92, 0.08]);
  const W = 900, H = 1200;
  const panel = (img: string, label: string, lit: boolean) => (
    <AbsoluteFill style={{ background: lit ? `linear-gradient(160deg, ${theme.accent}, ${theme.bg2})` : `linear-gradient(160deg, #3A3A40, #151518)`, alignItems: "center", justifyContent: "center" }}>
      {img ? <Img src={src(img)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: lit ? "none" : "grayscale(1) contrast(0.9)" }} /> : null}
      <div style={{ position: "absolute", top: 34, [lit ? "right" : "left"]: 34, padding: "10px 22px", borderRadius: 12, background: lit ? theme.ink : "rgba(0,0,0,0.6)", color: lit ? theme.bg : "#fff", fontFamily: theme.mono, fontWeight: 700, fontSize: 32, letterSpacing: 3 } as React.CSSProperties}>{label}</div>
    </AbsoluteFill>
  );
  return (
    <Safe>
      <div style={{ position: "relative", width: W, height: H, borderRadius: 36, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.55)" }}>
        {panel(after, afterLabel, true)}
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>{panel(before, beforeLabel, false)}</div>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: p * W - 4, width: 8, background: "#fff", boxShadow: "0 0 30px rgba(255,255,255,0.7)" }} />
        <div style={{ position: "absolute", top: H / 2 - 50, left: p * W - 50, width: 100, height: 100, borderRadius: 50, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 900, color: "#111", fontFamily: theme.body }}>⇆</div>
      </div>
    </Safe>
  );
};
