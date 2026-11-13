/** MEME-NATIVE formats — the visual language Gen-Z already reads fluently on Reels/TikTok. */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, fitSize, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { prop, Safe, type PrimitiveProps } from "./common";

/* ─────────────────────────── POV ───────────────────────────
 * "POV:" tag + the scenario types out, viewfinder corners + REC dot. The relatability opener. */
export const Pov: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const text = prop(beat, "text", beat.text.replace(/^pov:?\s*/i, ""));
  const tag = pop(frame, fps, 0, "slam");
  const typed = text.slice(0, Math.floor(Math.max(0, frame - 8) * Math.max(1.5, text.length / (beat.frames * 0.5))));
  const corner = (s: React.CSSProperties) => <div style={{ position: "absolute", width: 90, height: 90, borderColor: alpha(theme.ink, 0.7), borderStyle: "solid", borderWidth: 0, ...s }} />;
  return (
    <AbsoluteFill>
      {corner({ top: 250, left: 70, borderTopWidth: 6, borderLeftWidth: 6 })}
      {corner({ top: 250, right: 70, borderTopWidth: 6, borderRightWidth: 6 })}
      {corner({ bottom: 450, left: 70, borderBottomWidth: 6, borderLeftWidth: 6 })}
      {corner({ bottom: 450, right: 70, borderBottomWidth: 6, borderRightWidth: 6 })}
      <div style={{ position: "absolute", top: 280, left: 110, display: "flex", alignItems: "center", gap: 14, fontFamily: theme.mono, fontWeight: 700, fontSize: 32, color: theme.ink }}>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: "#FF2D2D", opacity: Math.floor(frame / 12) % 2 ? 0.3 : 1 }} />REC {String(Math.floor(frame / 30)).padStart(2, "0")}:{String(frame % 30).padStart(2, "0")}
      </div>
      <Safe align="start">
        <div style={{ display: "inline-block", padding: "10px 30px", background: theme.accent, color: theme.onAccent, fontFamily: theme.display, fontWeight: 900, fontSize: 90, transform: `scale(${tag}) rotate(-3deg)`, transformOrigin: "left center", marginBottom: 36 }}>POV:</div>
        <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 70, lineHeight: 1.15, color: theme.ink, maxWidth: 900 }}>{typed}<span style={{ color: theme.accent, opacity: Math.floor(frame / 7) % 2 ? 0 : 1 }}>|</span></div>
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── LOADING ───────────────────────────
 * Progress bar fills, STALLS at 99% (the joke), then snaps to 100 with a flash. */
export const Loading: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const label = prop(beat, "label", "Loading confidence");
  const done = prop(beat, "done", "Confidence installed ✓");
  const stallAt = Math.floor(beat.frames * 0.45), snapAt = Math.floor(beat.frames * 0.75);
  const p = frame < stallAt ? easeOut(frame, 2, stallAt - 2) * 99 : frame < snapAt ? 99 : 100;
  const finished = frame >= snapAt;
  const flash = finished ? 1 - easeOut(frame, snapAt, 8) : 0;
  return (
    <Safe>
      <div style={{ width: 900, fontFamily: theme.mono }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 40, fontWeight: 700, color: theme.ink, marginBottom: 22 }}>
          <span>{finished ? done : `${label}${".".repeat(1 + (Math.floor(frame / 6) % 3))}`}</span>
          <span style={{ color: theme.accent }}>{Math.floor(p)}%</span>
        </div>
        <div style={{ height: 70, borderRadius: 14, border: `4px solid ${theme.ink}`, padding: 6 }}>
          <div style={{ height: "100%", width: `${p}%`, borderRadius: 6, background: `repeating-linear-gradient(-45deg, ${theme.accent} 0 22px, ${alpha(theme.accent, 0.7)} 22px 44px)`, backgroundPosition: `${frame * 3}px 0`, boxShadow: finished ? `0 0 40px ${theme.accent}` : "none" }} />
        </div>
        {frame >= stallAt && !finished ? <div style={{ marginTop: 24, fontSize: 30, color: theme.dim }}>estimated time remaining: {Math.max(1, 99 - (frame - stallAt) * 7)} years</div> : null}
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.7, pointerEvents: "none" }} />
    </Safe>
  );
};

/* ─────────────────────────── ERROR POPUPS ───────────────────────────
 * Retro OS error dialogs cascade across the screen ("motivation.exe has stopped responding"). */
export const ErrorPopups: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const errors = prop<string[]>(beat, "errors", ["motivation.exe has stopped responding", "sleep_schedule.dll not found", "Low balance: 2%", "Are you sure you want to quit?"]);
  const step = Math.max(4, Math.floor((beat.frames * 0.6) / Math.max(1, errors.length)));
  return (
    <AbsoluteFill>
      {errors.map((e, i) => {
        const at = 2 + i * step;
        if (frame < at) return null;
        const s = pop(frame, fps, at, "snap");
        const x = 70 + hash01(i, seed) * 220 + i * 26;
        const y = 290 + i * 165 + hash01(i, seed, 2) * 30;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 760, transform: `scale(${interpolate(s, [0, 1], [0.5, 1])})`, opacity: Math.min(1, s * 2), boxShadow: "8px 8px 0 rgba(0,0,0,0.6)", border: `3px solid ${theme.ink}`, background: theme.surface, fontFamily: theme.mono }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: theme.accent, color: theme.onAccent, fontWeight: 700, fontSize: 28 }}>
              <span>⚠ Error</span><span style={{ border: `2px solid ${theme.onAccent}`, padding: "0 10px" }}>✕</span>
            </div>
            <div style={{ padding: "26px 26px 22px", fontSize: 34, fontWeight: 700, color: theme.ink, lineHeight: 1.3 }}>{e}</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "flex-end", padding: "0 22px 22px" }}>
              {["Ignore", "OK"].map((b) => <span key={b} style={{ padding: "8px 26px", border: `3px solid ${theme.ink}`, fontSize: 26, fontWeight: 700, color: theme.ink }}>{b}</span>)}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── RECEIPT ───────────────────────────
 * Thermal receipt prints out line by line (cost breakdowns), TOTAL lands with a stamp. */
type Line = { item: string; price: string };
export const Receipt: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const title = prop(beat, "title", "MONTHLY COST");
  const lines = prop<Line[]>(beat, "lines", [{ item: "Video editor", price: "$0" }, { item: "Voice actor", price: "$0" }, { item: "Motion designer", price: "$0" }]);
  const total = prop(beat, "total", "$0.00");
  const printed = easeOut(frame, 2, Math.max(14, beat.frames * 0.55));
  const stampAt = Math.floor(beat.frames * 0.62);
  const stamp = frame >= stampAt ? pop(frame, fps, stampAt, "slam") : 0;
  const H = 300 + lines.length * 76;
  return (
    <Safe>
      <div style={{ position: "relative", width: 700, height: H * printed, overflow: "hidden", transform: `rotate(-2deg)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: H, background: "#F4F1EA", color: "#111", fontFamily: theme.mono, padding: "40px 44px", boxShadow: "0 30px 70px rgba(0,0,0,0.5)", WebkitMaskImage: "linear-gradient(transparent 0, black 6px)" }}>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 40, letterSpacing: 4 }}>{title}</div>
          <div style={{ borderTop: "3px dashed #111", margin: "22px 0" }} />
          {lines.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 36, lineHeight: "76px" }}><span>{l.item}</span><span>{l.price}</span></div>
          ))}
          <div style={{ borderTop: "3px dashed #111", margin: "22px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 48, fontWeight: 700 }}><span>TOTAL</span><span>{total}</span></div>
        </div>
      </div>
      {stamp > 0 ? <div style={{ position: "absolute", top: "52%", left: "50%", transform: `translate(-50%, -50%) rotate(-14deg) scale(${interpolate(stamp, [0, 1], [2.4, 1])})`, opacity: Math.min(1, stamp * 1.5), border: `10px solid ${theme.accent}`, color: theme.accent, padding: "6px 34px", fontFamily: theme.display, fontWeight: 900, fontSize: 110, letterSpacing: 6, mixBlendMode: theme.dark ? "normal" : "multiply" }}>{prop(beat, "stamp", "PAID")}</div> : null}
    </Safe>
  );
};

/* ─────────────────────────── ROTATOR ───────────────────────────
 * "I build [apps → brands → videos → empires]" — the last word slot-rolls through options. */
export const Rotator: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const lead = prop(beat, "lead", "I build");
  const words = prop<string[]>(beat, "words", ["apps", "brands", "videos", "empires"]);
  const n = words.length;
  const seg = Math.max(6, (beat.frames * 0.8) / n);
  const pos = Math.min(n - 1, Math.max(0, (frame - 4) / seg));
  const idx = Math.floor(pos);
  const t = easeInOut(pos - idx, 0.55, 0.45);
  const scroll = (idx + (idx < n - 1 ? t : 0)) * 170;
  return (
    <Safe>
      <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 90, color: theme.dim, marginBottom: 6 }}>{lead}</div>
      <div style={{ height: 170, overflow: "hidden", maskImage: "linear-gradient(transparent, black 25%, black 75%, transparent)" }}>
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          {words.map((w, i) => (
            <div key={i} style={{ height: 170, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: fitSize([w], 940, 160, 80, 0.58), textTransform: theme.displayUpper ? "uppercase" : "none", color: i === n - 1 ? theme.accent : theme.ink }}>{w}</div>
          ))}
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── SLOT MACHINE ───────────────────────────
 * Three reels spin, stop left-to-right, land on the result; jackpot glow. Luck vs system jokes. */
export const SlotMachine: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const result = prop<string[]>(beat, "result", ["7", "7", "7"]);
  const symbols = prop<string[]>(beat, "symbols", ["7", "★", "◆", "♣", "$", "⚡"]);
  const label = prop(beat, "label", "");
  const cell = 230;
  const all = result.map((_, r) => {
    const stop = 10 + r * 9;
    const prog = easeOut(frame, 0, stop);
    const spins = 14 + r * 4;
    return { prog, spins, landed: frame >= stop };
  });
  const jackpot = all.every((a) => a.landed);
  return (
    <Safe>
      <div style={{ display: "flex", gap: 18, padding: 26, borderRadius: 34, background: theme.surface, border: `6px solid ${jackpot ? theme.accent : alpha(theme.ink, 0.2)}`, boxShadow: jackpot ? `0 0 70px ${alpha(theme.accent, 0.6)}` : "0 30px 70px rgba(0,0,0,0.5)" }}>
        {result.map((res, r) => {
          const { prog, spins } = all[r];
          const strip = [...Array.from({ length: spins }, (_, k) => symbols[Math.floor(hash01(r, k) * symbols.length)]), res];
          const y = -prog * (strip.length - 1) * cell;
          return (
            <div key={r} style={{ width: cell, height: cell, overflow: "hidden", borderRadius: 18, background: alpha(theme.ink, 0.06) }}>
              <div style={{ transform: `translateY(${y}px)`, filter: prog < 0.95 ? `blur(${(1 - prog) * 6}px)` : "none" }}>
                {strip.map((s, k) => <div key={k} style={{ height: cell, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 130, fontWeight: 900, fontFamily: theme.display, color: k === strip.length - 1 ? theme.accent : theme.ink }}>{s}</div>)}
              </div>
            </div>
          );
        })}
      </div>
      {label ? <div style={{ marginTop: 44, fontFamily: theme.display, fontWeight: 900, fontSize: 90, color: theme.ink, textTransform: "uppercase", opacity: jackpot ? easeOut(frame, 30, 8) : 0 }}>{label}</div> : null}
    </Safe>
  );
};

/* ─────────────────────────── VERDICT STAMP ───────────────────────────
 * A document/claim card gets slammed with APPROVED / REJECTED / OVERRATED. */
export const Verdict: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const claim = prop(beat, "claim", beat.text);
  const verdict = prop(beat, "verdict", "OVERRATED");
  const good = prop(beat, "good", false);
  const card = pop(frame, fps, 0, "snap");
  const at = Math.floor(beat.frames * 0.45);
  const s = frame >= at ? pop(frame, fps, at, "slam") : 0;
  const color = good ? "#2BD576" : theme.accent;
  return (
    <Safe>
      <div style={{ position: "relative", width: 860, padding: "60px 56px", borderRadius: 18, background: "#F4F1EA", transform: `rotate(2deg) translateY(${(1 - card) * 200}px)`, opacity: card, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontFamily: theme.mono, fontSize: 28, color: "#666", letterSpacing: 3, marginBottom: 20 }}>CLAIM #{String(beat.index + 1).padStart(3, "0")}</div>
        <div style={{ fontFamily: theme.body, fontWeight: 900, fontSize: 64, lineHeight: 1.15, color: "#111" }}>{claim}</div>
        {s > 0 ? (
          <div style={{ position: "absolute", right: 20, bottom: -150, transform: `rotate(-10deg) scale(${interpolate(s, [0, 1], [3, 1])})`, opacity: Math.min(1, s * 1.6), border: `10px solid ${color}`, borderRadius: 14, padding: "4px 30px", color, fontFamily: theme.display, fontWeight: 900, fontSize: 96, letterSpacing: 4, background: alpha("#F4F1EA", 0.6) }}>{verdict}</div>
        ) : null}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── TIMER ───────────────────────────
 * Big countdown clock (mm:ss) ticking fast toward 00:00 with a shrinking ring. Urgency. */
export const Timer: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const from = prop(beat, "from", 60);
  const label = prop(beat, "label", "seconds to change your mind");
  const t = easeInOut(frame, 2, Math.max(12, beat.frames * 0.75));
  const left = Math.ceil(from * (1 - t));
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  const R = 380, C = 2 * Math.PI * R;
  const urgent = left <= from * 0.2;
  return (
    <Safe>
      <div style={{ position: "relative", width: 820, height: 820, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={820} height={820} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
          <circle cx={410} cy={410} r={R} stroke={alpha(theme.ink, 0.1)} strokeWidth={22} fill="none" />
          <circle cx={410} cy={410} r={R} stroke={theme.accent} strokeWidth={22} fill="none" strokeDasharray={C} strokeDashoffset={C * t} strokeLinecap="round" />
        </svg>
        <div style={{ textAlign: "center", transform: urgent ? `scale(${1 + Math.sin(frame / 2) * 0.03})` : "none" }}>
          <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 210, color: urgent ? theme.accent : theme.ink, letterSpacing: -6 }}>{mm}:{ss}</div>
          <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 38, color: theme.dim, maxWidth: 560 }}>{label}</div>
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── STICKY NOTES ───────────────────────────
 * Notes slap onto a wall at jaunty angles, one per item (ideas, lessons, rules). */
export const StickyNotes: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const notes = prop<string[]>(beat, "notes", ["ship daily", "no excuses", "systems > goals", "post anyway"]);
  const step = Math.max(5, Math.floor((beat.frames * 0.7) / Math.max(1, notes.length)));
  const colors = ["#FFE45C", "#F4F1EA", theme.accent, "#FFFFFF"];
  return (
    <AbsoluteFill>
      {notes.map((n, i) => {
        const at = 3 + i * step;
        if (frame < at) return null;
        const s = pop(frame, fps, at, "slam");
        const col = i % 2, row = Math.floor(i / 2);
        const x = 90 + col * 470 + hash01(i, seed) * 40;
        const y = 330 + row * 470 + hash01(i, seed, 1) * 50;
        const rot = (hash01(i, seed, 2) - 0.5) * 14;
        const bg = colors[i % colors.length];
        const dark = bg === theme.accent;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 420, height: 420, background: bg, padding: 40, transform: `rotate(${rot}deg) scale(${interpolate(s, [0, 1], [1.6, 1])})`, opacity: Math.min(1, s * 2), boxShadow: "0 24px 50px rgba(0,0,0,0.45)", fontFamily: theme.body, fontWeight: 900, fontSize: 58, lineHeight: 1.1, color: dark ? theme.onAccent : "#111", display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", top: -18, left: 160, width: 100, height: 36, background: alpha("#FFFFFF", 0.55), transform: "rotate(-4deg)" }} />
            {n}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── SPOTLIGHT ───────────────────────────
 * Pitch-black stage; a spotlight sweeps, searches, then locks onto the word — reveal drama. */
export const Spotlight: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const word = prop(beat, "word", beat.text);
  const lockAt = Math.floor(beat.frames * 0.45);
  const lock = easeInOut(frame, lockAt - 8, 10);
  const sx = interpolate(lock, [0, 1], [50 + Math.sin(frame / 7) * 30, 50]);
  const sy = interpolate(lock, [0, 1], [45 + Math.cos(frame / 9) * 15, 45]);
  const r = interpolate(lock, [0, 1], [16, 34]);
  return (
    <AbsoluteFill>
      <Safe>
        <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: fitSize(word.split(/\s+/), 920, 170, 80, 0.56), lineHeight: 0.95, textAlign: "center", color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none" }}>{word}</div>
      </Safe>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${sx}% ${sy}%, transparent ${r - 2}%, rgba(0,0,0,0.96) ${r + 6}%)`, pointerEvents: "none" }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${sx}% ${sy}%, ${alpha(theme.accent, 0.18 * lock)}, transparent ${r + 4}%)`, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

/* ─────────────────────────── KEYBOARD ───────────────────────────
 * Mechanical keys light up as a shortcut/word is "typed"; the combo appears above. */
export const Keyboard: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const keys = prop<string[]>(beat, "keys", ["CTRL", "SHIFT", "P"]);
  const caption = prop(beat, "caption", "the only shortcut you need");
  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  const step = Math.max(5, Math.floor((beat.frames * 0.5) / Math.max(1, keys.length)));
  const pressed = (k: string) => {
    const i = keys.findIndex((x) => x.toUpperCase() === k.toUpperCase());
    if (i < 0) return 0;
    const at = 4 + i * step;
    return frame >= at ? 1 - Math.min(1, (frame - at) / 30) * 0.3 : 0;
  };
  const key = (k: string, w = 82) => {
    const p = pressed(k);
    return <div key={k} style={{ width: w, height: 82, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.mono, fontWeight: 700, fontSize: k.length > 1 ? 22 : 32, background: p ? theme.accent : theme.surface, color: p ? theme.onAccent : theme.ink, boxShadow: p ? `0 2px 0 ${alpha("#000", 0.6)}, 0 0 30px ${theme.accent}` : `0 8px 0 ${alpha("#000", 0.6)}`, transform: `translateY(${p ? 6 : 0}px)` }}>{k}</div>;
  };
  return (
    <Safe>
      <div style={{ display: "flex", gap: 16, marginBottom: 60 }}>
        {keys.map((k, i) => {
          const s = easeOut(frame, 4 + i * step, 6);
          return <React.Fragment key={k}>{i ? <span style={{ fontSize: 70, color: theme.dim, fontWeight: 900, opacity: s }}>+</span> : null}<span style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 70, color: theme.ink, opacity: s, transform: `translateY(${(1 - s) * 20}px)`, display: "inline-block" }}>{k}</span></React.Fragment>;
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: 26, borderRadius: 28, background: alpha(theme.ink, 0.05), transform: "perspective(1400px) rotateX(28deg)" }}>
        {rows.map((r, i) => <div key={i} style={{ display: "flex", gap: 10 }}>{r.split("").map((k) => key(k))}</div>)}
        <div style={{ display: "flex", gap: 10 }}>{key("CTRL", 150)}{key("ALT", 120)}{key("SPACE", 380)}{key("SHIFT", 150)}</div>
      </div>
      <div style={{ marginTop: 50, fontFamily: theme.body, fontWeight: 800, fontSize: 46, color: theme.ink, opacity: easeOut(frame, beat.frames * 0.55, 8) }}>{caption}</div>
    </Safe>
  );
};

/* ─────────────────────────── SCOREBOARD ───────────────────────────
 * Stadium scoreboard: two sides, stat rows tick up; the winning side's column lights. */
type Row = { label: string; a: number; b: number };
export const Scoreboard: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const a = prop(beat, "a", "ME");
  const b = prop(beat, "b", "THEM");
  const rows = prop<Row[]>(beat, "rows", [{ label: "Videos/week", a: 14, b: 2 }, { label: "Cost", a: 0, b: 4000 }, { label: "Hours", a: 1, b: 40 }]);
  const lowerWins = prop<string[]>(beat, "lowerWins", ["Cost", "Hours"]);
  const t = easeOut(frame, 4, Math.max(14, beat.frames * 0.55));
  const cell = (v: number, lit: boolean) => <div style={{ width: 230, textAlign: "center", fontFamily: theme.mono, fontWeight: 700, fontSize: 64, color: lit ? theme.accent : theme.ink, textShadow: lit ? `0 0 24px ${theme.accent}` : "none" }}>{Math.round(v * t).toLocaleString("en-US")}</div>;
  return (
    <Safe>
      <div style={{ width: 940, borderRadius: 26, overflow: "hidden", border: `4px solid ${alpha(theme.ink, 0.2)}`, background: "#0A0A0C" }}>
        <div style={{ display: "flex", padding: "26px 30px", background: theme.accent, color: theme.onAccent, fontFamily: theme.display, fontWeight: 900, fontSize: 52 }}>
          <div style={{ flex: 1 }} /><div style={{ width: 230, textAlign: "center" }}>{a}</div><div style={{ width: 230, textAlign: "center" }}>{b}</div>
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", padding: "24px 30px", borderTop: `2px solid ${alpha("#FFFFFF", 0.08)}`, opacity: easeOut(frame, 2 + i * 4, 6) }}>
            <div style={{ flex: 1, fontFamily: theme.body, fontWeight: 800, fontSize: 40, color: "#DDD" }}>{r.label}</div>
            {cell(r.a, lowerWins.includes(r.label) ? r.a < r.b : r.a > r.b)}
            {cell(r.b, lowerWins.includes(r.label) ? r.b < r.a : r.b > r.a)}
          </div>
        ))}
      </div>
    </Safe>
  );
};
