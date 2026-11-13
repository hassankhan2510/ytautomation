import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeOut, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { prop, Safe, type PrimitiveProps } from "./common";
import { AuroraType, Blob, DotWave, FlowField, Warp } from "./generative";

const src = (p: string) => (/^https?:\/\//.test(p) ? p : staticFile(p));

/* ─────────────────────────── LIST ───────────────────────────
 * Numbered items punch in one by one; the current item is lit, the rest dim. */
export const List: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const items = prop<string[]>(beat, "items", [beat.text]);
  const title = prop(beat, "title", "");
  const step = Math.max(6, Math.floor((beat.frames * 0.75) / Math.max(1, items.length)));
  const current = Math.min(items.length - 1, Math.floor(Math.max(0, frame - 4) / step));
  return (
    <Safe align="start">
      {title ? (
        <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 32, letterSpacing: 6, color: theme.accent, marginBottom: 34, textTransform: "uppercase", opacity: easeOut(frame, 0, 8) }}>{title}</div>
      ) : null}
      {items.map((it, i) => {
        const at = 4 + i * step;
        const s = pop(frame, fps, at, "snap");
        const lit = i === current;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 26, opacity: frame < at ? 0 : (lit ? 1 : 0.38) * s, transform: `translateX(${(1 - s) * -120}px)` }}>
            <div style={{ width: 96, height: 96, flexShrink: 0, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", background: lit ? theme.accent : alpha(theme.ink, 0.08), color: lit ? theme.onAccent : theme.ink, fontFamily: theme.mono, fontWeight: 700, fontSize: 44, boxShadow: lit ? `0 0 40px ${alpha(theme.accent, 0.5)}` : "none" }}>{String(i + 1).padStart(2, "0")}</div>
            <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 58, lineHeight: 1.1, color: theme.ink, maxWidth: 780 }}>{it}</div>
          </div>
        );
      })}
    </Safe>
  );
};

/* ─────────────────────────── VERSUS ───────────────────────────
 * Split screen. Left (old way) slides in grey, right (new way) slams in lit; a VS badge spins between. */
export const Versus: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const left = prop(beat, "left", "THEM");
  const right = prop(beat, "right", "US");
  const leftSub = prop(beat, "leftSub", "");
  const rightSub = prop(beat, "rightSub", "");
  const a = pop(frame, fps, 2, "snap");
  const b = pop(frame, fps, Math.floor(beat.frames * 0.35), "slam");
  const vs = pop(frame, fps, Math.floor(beat.frames * 0.2), "slam");
  const panel = (txt: string, sub: string, lit: boolean, s: number, fromY: number): React.ReactNode => (
    <div style={{ flex: 1, borderRadius: 34, padding: "50px 40px", display: "flex", flexDirection: "column", justifyContent: "center", background: lit ? theme.accent : alpha(theme.ink, 0.07), border: lit ? "none" : `2px solid ${alpha(theme.ink, 0.12)}`, transform: `translateY(${(1 - s) * fromY}px) scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s, boxShadow: lit ? `0 30px 80px ${alpha(theme.accent, 0.45)}` : "none" }}>
      <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: 96, lineHeight: 0.95, textTransform: theme.displayUpper ? "uppercase" : "none", color: lit ? theme.onAccent : alpha(theme.ink, 0.55), textDecoration: lit ? "none" : "line-through", textDecorationThickness: 6 }}>{txt}</div>
      {sub ? <div style={{ fontFamily: theme.body, fontWeight: 600, fontSize: 36, marginTop: 18, color: lit ? alpha(theme.onAccent, 0.85) : theme.dim }}>{sub}</div> : null}
    </div>
  );
  return (
    <Safe>
      <div style={{ width: 912, display: "flex", flexDirection: "column", gap: 30, position: "relative" }}>
        {panel(left, leftSub, false, a, -300)}
        {panel(right, rightSub, true, b, 300)}
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 75, background: theme.bg, border: `5px solid ${theme.ink}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.display, fontWeight: 900, fontSize: 58, color: theme.ink, transform: `scale(${vs}) rotate(${(1 - vs) * -200}deg)`, zIndex: 5 }}>VS</div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── BARS ───────────────────────────
 * Horizontal bar race: bars grow with spring overshoot, values count up, the winner glows. */
type Bar = { label: string; value: number };
export const Bars: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const data = prop<Bar[]>(beat, "data", [{ label: "Agency", value: 4000 }, { label: "Freelancer", value: 900 }, { label: "This system", value: 0 }]);
  const unit = prop(beat, "unit", "");
  const prefix = prop(beat, "prefix", "");
  const highlight = prop(beat, "highlight", -1);
  const title = prop(beat, "title", "");
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  return (
    <Safe align="start">
      {title ? <div style={{ fontFamily: theme.body, fontWeight: 900, fontSize: 58, color: theme.ink, marginBottom: 46, lineHeight: 1.1 }}>{title}</div> : null}
      {data.map((d, i) => {
        const s = pop(frame, fps, 4 + i * 5, "snap");
        const v = Number(d.value) || 0;
        const lit = highlight === i || (highlight < 0 && i === data.length - 1);
        const w = Math.max(0.012, v / max) * 860 * s;
        return (
          <div key={i} style={{ marginBottom: 34, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: 900, fontFamily: theme.body, fontWeight: 700, fontSize: 36, color: lit ? theme.ink : theme.dim, marginBottom: 12 }}>
              <span>{d.label}</span>
              <span style={{ fontFamily: theme.mono, color: lit ? theme.accent : theme.dim }}>{prefix}{Math.round(v * Math.min(1, s)).toLocaleString("en-US")}{unit}</span>
            </div>
            <div style={{ height: 64, width: w, borderRadius: 14, background: lit ? theme.accent : alpha(theme.ink, 0.18), boxShadow: lit ? `0 0 40px ${alpha(theme.accent, 0.5)}` : "none" }} />
          </div>
        );
      })}
    </Safe>
  );
};

/* ─────────────────────────── PHOTO ───────────────────────────
 * User photo (uploaded into public/photos) as a floating card: Ken-Burns push, 3D tilt settle,
 * blurred copy of itself as the background (no black bars, ever), caption tag. */
export const Photo: React.FC<PrimitiveProps> = ({ beat, rng }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const file = prop(beat, "src", "");
  const caption = prop(beat, "caption", "");
  const s = pop(frame, fps, 0, "smooth");
  const dir = rng.sign();
  const kb = interpolate(frame, [0, beat.frames], [1.04, 1.16]);
  const panX = interpolate(frame, [0, beat.frames], [0, dir * 26]);
  if (!file) {
    // No picture → a seeded generative world, never a dead frame.
    const Gen = [Blob, Warp, FlowField, DotWave, AuroraType][Math.floor(hash01(seed, beat.index, beat.text.length) * 5)];
    return <Gen beat={beat} rng={rng} />;
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: "blur(40px) brightness(0.45) saturate(1.2)", transform: "scale(1.25)" }}>
        <Img src={src(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <Safe>
        <div style={{ position: "relative", transform: `perspective(1600px) rotateY(${(1 - s) * dir * 24}deg) rotateZ(${dir * -2 * s}deg) scale(${interpolate(s, [0, 1], [0.8, 1])})`, opacity: s }}>
          <div style={{ width: 800, height: 1000, borderRadius: 36, overflow: "hidden", boxShadow: `0 50px 120px rgba(0,0,0,0.6), 0 0 0 3px ${alpha(theme.ink, 0.1)}` }}>
            <Img src={src(file)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${kb}) translateX(${panX}px)` }} />
          </div>
          {caption ? (
            <div style={{ position: "absolute", left: -20, bottom: 60, padding: "16px 28px", background: theme.accent, color: theme.onAccent, fontFamily: theme.body, fontWeight: 900, fontSize: 40, borderRadius: 12, transform: `rotate(-3deg) translateX(${(1 - easeOut(frame, 8, 10)) * -400}px)` }}>{caption}</div>
          ) : null}
        </div>
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── OUTRO ───────────────────────────
 * End card: avatar ring draws on, handle types, follow button pulses with a tap. Loops the CTA. */
export const Outro: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, handle } = useRender();
  const h = prop(beat, "handle", handle || "@cohort_zero");
  const cta = prop(beat, "cta", "Follow for Day 2");
  const logo = prop(beat, "logo", "");
  const ring = easeOut(frame, 0, 18);
  const s = pop(frame, fps, 4, "slam");
  const typed = h.slice(0, Math.floor(Math.max(0, frame - 10) * 1.4));
  const tapAt = Math.floor(beat.frames * 0.55);
  const tap = frame >= tapAt ? pop(frame, fps, tapAt, "snap") : 0;
  const pulse = 1 + Math.sin(frame / 5) * 0.025;
  const C = 2 * Math.PI * 170;
  return (
    <Safe>
      <div style={{ position: "relative", width: 360, height: 360, transform: `scale(${s})` }}>
        <svg width={360} height={360} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={180} cy={180} r={170} fill="none" stroke={theme.accent} strokeWidth={8} strokeDasharray={C} strokeDashoffset={C * (1 - ring)} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", inset: 22, borderRadius: "50%", overflow: "hidden", background: `linear-gradient(135deg, ${theme.bg2}, ${theme.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {logo ? <Img src={src(logo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 120, color: theme.ink }}>{h.replace("@", "").slice(0, 1).toUpperCase()}</span>}
        </div>
      </div>
      <div style={{ marginTop: 44, fontFamily: theme.mono, fontWeight: 700, fontSize: 60, color: theme.ink, minHeight: 72 }}>{typed}<span style={{ opacity: Math.floor(frame / 8) % 2 ? 0 : 1, color: theme.accent }}>▍</span></div>
      <div style={{ marginTop: 40, position: "relative" }}>
        <div style={{ padding: "28px 90px", borderRadius: 999, fontFamily: theme.body, fontWeight: 900, fontSize: 46, background: tap > 0.5 ? alpha(theme.ink, 0.12) : theme.accent, color: tap > 0.5 ? theme.ink : theme.onAccent, transform: `scale(${pulse * (1 - Math.sin(tap * Math.PI) * 0.08)})`, boxShadow: tap > 0.5 ? "none" : `0 0 50px ${alpha(theme.accent, 0.55)}`, opacity: easeOut(frame, 14, 8) }}>
          {tap > 0.5 ? "Following ✓" : cta}
        </div>
        {frame >= tapAt - 6 ? (
          <div style={{ position: "absolute", right: 60, bottom: -50, width: 70, height: 70, borderRadius: 35, background: alpha("#FFFFFF", 0.85), border: "4px solid rgba(0,0,0,0.25)", transform: `translate(${interpolate(frame, [tapAt - 6, tapAt], [80, 0], { extrapolateRight: "clamp" })}px, ${interpolate(frame, [tapAt - 6, tapAt], [80, 0], { extrapolateRight: "clamp" })}px) scale(${1 - Math.sin(tap * Math.PI) * 0.25})`, opacity: 1 - easeOut(frame, tapAt + 10, 8) }} />
        ) : null}
      </div>
    </Safe>
  );
};
