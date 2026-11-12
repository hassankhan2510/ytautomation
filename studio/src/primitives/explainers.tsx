/**
 * EXPLAINER + NEWS formats — tech news, project breakdowns, "how X works".
 * Perf rule (measured on CPU runners): no full-screen `filter: blur` or `mix-blend-mode` here.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { prop, Safe, type PrimitiveProps } from "./common";

/* ─────────────────────────── NEWS BANNER ───────────────────────────
 * TV-news package: BREAKING bar wipes in, headline slams, ticker crawls along the bottom. */
export const NewsBanner: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const label = prop(beat, "label", "BREAKING");
  const headline = prop(beat, "headline", beat.text);
  const ticker = prop(beat, "ticker", "AI agents ship 10x more code ✦ Startups go remote-first ✦ Karachi tech scene doubles ✦");
  const bar = easeOut(frame, 0, 8);
  const h = pop(frame, fps, 6, "slam");
  return (
    <AbsoluteFill>
      <Safe align="start">
        <div style={{ display: "flex", alignItems: "stretch", marginBottom: 26, clipPath: `inset(0 ${(1 - bar) * 100}% 0 0)` }}>
          <div style={{ padding: "14px 28px", background: theme.accent, color: theme.onAccent, fontFamily: theme.display, fontWeight: 900, fontSize: 54, letterSpacing: 2 }}>{label}</div>
          <div style={{ padding: "14px 24px", background: theme.ink, color: theme.bg, fontFamily: theme.mono, fontWeight: 700, fontSize: 40, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 16, height: 16, borderRadius: 8, background: theme.accent, opacity: Math.floor(frame / 10) % 2 ? 0.3 : 1 }} />LIVE
          </div>
        </div>
        <div style={{ fontFamily: theme.body, fontWeight: 900, fontSize: 84, lineHeight: 1.05, color: theme.ink, maxWidth: 920, transform: `translateY(${(1 - h) * 60}px)`, opacity: Math.min(1, h * 1.5) }}>{headline}</div>
      </Safe>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 470, height: 78, background: alpha(theme.ink, 0.92), display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ flexShrink: 0, height: "100%", padding: "0 26px", display: "flex", alignItems: "center", background: theme.accent, color: theme.onAccent, fontFamily: theme.mono, fontWeight: 700, fontSize: 30, zIndex: 2 }}>TECH</div>
        <div style={{ whiteSpace: "nowrap", transform: `translateX(${-frame * 7}px)`, fontFamily: theme.body, fontWeight: 800, fontSize: 36, color: theme.bg, paddingLeft: 30 }}>{`${ticker} ${ticker} ${ticker}`}</div>
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── HEADLINES ───────────────────────────
 * Newspaper-style clippings from different "sources" stack up, each slightly rotated. Proof something is a trend. */
type Clip = { source: string; title: string };
export const Headlines: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { seed } = useRender();
  const clips = prop<Clip[]>(beat, "clips", [{ source: "TECH DAILY", title: "AI video tools explode in 2026" }, { source: "THE FOUNDER", title: "Solo creators out-ship agencies" }, { source: "MARKETS", title: "Short-form ad spend hits record" }]);
  const step = Math.max(6, Math.floor((beat.frames * 0.6) / Math.max(1, clips.length)));
  return (
    <AbsoluteFill>
      {clips.map((c, i) => {
        const at = 3 + i * step;
        if (frame < at) return null;
        const s = pop(frame, fps, at, "slam");
        const rot = (hash01(i, seed) - 0.5) * 9;
        return (
          <div key={i} style={{ position: "absolute", left: 90 + (hash01(i, seed, 1) - 0.5) * 60, top: 360 + i * 300, width: 900, padding: "34px 40px", background: "#F2EEE4", color: "#111", transform: `rotate(${rot}deg) scale(${interpolate(s, [0, 1], [1.5, 1])})`, opacity: Math.min(1, s * 2), boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 28, letterSpacing: 6, borderBottom: "3px double #111", paddingBottom: 10, marginBottom: 16, fontWeight: 700 }}>{c.source}</div>
            <div style={{ fontFamily: "Georgia, serif", fontWeight: 900, fontSize: 58, lineHeight: 1.08 }}>{c.title}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── HISTORY ───────────────────────────
 * Horizontal timeline scrolls sideways through years; the active milestone lifts. Company/tech history. */
type Mile = { year: string; text: string };
export const History: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const items = prop<Mile[]>(beat, "items", [{ year: "2019", text: "First idea" }, { year: "2022", text: "First product" }, { year: "2024", text: "First 1,000 users" }, { year: "2026", text: "Runs itself" }]);
  const n = items.length, gap = 420;
  const p = easeInOut(frame, 6, Math.max(16, beat.frames * 0.8)) * (n - 1);
  const active = Math.round(p);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 960, left: 0, right: 0, height: 6, background: alpha(theme.ink, 0.15) }} />
      <div style={{ position: "absolute", top: 0, left: 540 - p * gap, height: "100%" }}>
        <div style={{ position: "absolute", top: 960, left: 0, width: p * gap, height: 6, background: theme.accent }} />
        {items.map((m, i) => {
          const lit = i === active;
          const d = Math.abs(i - p);
          return (
            <div key={i} style={{ position: "absolute", left: i * gap - 170, top: 0, width: 340, height: "100%" }}>
              <div style={{ position: "absolute", top: 940, left: 148, width: 46, height: 46, borderRadius: 23, background: i <= p + 0.01 ? theme.accent : theme.bg, border: `6px solid ${theme.accent}` }} />
              <div style={{ position: "absolute", top: lit ? 640 : 700, left: 0, right: 0, textAlign: "center", fontFamily: theme.display, fontWeight: 900, fontSize: lit ? 150 : 90, color: lit ? theme.ink : alpha(theme.ink, 0.35), opacity: Math.max(0.2, 1 - d * 0.5) }}>{m.year}</div>
              <div style={{ position: "absolute", top: 1040, left: 0, right: 0, textAlign: "center", fontFamily: theme.body, fontWeight: 800, fontSize: 44, lineHeight: 1.15, color: lit ? theme.ink : theme.dim, opacity: Math.max(0.15, 1 - d * 0.7) }}>{m.text}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── APP GRID ───────────────────────────
 * Phone home-screen grid of app icons; one wiggles (jiggle mode), then pops forward with its name. Tool reveals. */
type App = { name: string; letter?: string; color?: string };
export const AppGrid: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const apps = prop<App[]>(beat, "apps", [{ name: "Remotion" }, { name: "Groq" }, { name: "Kokoro" }, { name: "GitHub" }, { name: "Whisper" }, { name: "Pexels" }, { name: "Buffer" }, { name: "Canva" }, { name: "Notion" }]);
  const pick = Math.max(0, Math.min(apps.length - 1, prop(beat, "pick", 0)));
  const at = Math.floor(beat.frames * 0.45);
  const lift = frame >= at ? pop(frame, fps, at, "snap") : 0;
  const palette = [theme.accent, "#2A2A30", "#F4F1EA", "#3A0A12", "#7A7A82"];
  return (
    <Safe>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 240px)", gap: "50px 60px" }}>
        {apps.slice(0, 12).map((a, i) => {
          const s = pop(frame, fps, i * 1.5, "snap");
          const chosen = i === pick;
          const wig = chosen && frame < at ? Math.sin(frame * 1.6) * 4 : 0;
          const bg = a.color || palette[Math.floor(hash01(i, seed) * palette.length)];
          const lightBg = bg === "#F4F1EA";
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, opacity: chosen || !lift ? s : s * (1 - lift * 0.7), transform: `scale(${s * (chosen ? 1 + lift * 0.35 : 1)}) rotate(${wig}deg)`, zIndex: chosen ? 5 : 1 }}>
              <div style={{ width: 200, height: 200, borderRadius: 50, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.display, fontWeight: 900, fontSize: 110, color: lightBg ? "#111" : "#fff", boxShadow: chosen && lift ? `0 0 0 6px ${theme.ink}, 0 30px 60px rgba(0,0,0,0.6)` : "0 14px 30px rgba(0,0,0,0.4)" }}>{(a.letter || a.name.slice(0, 1)).toUpperCase()}</div>
              <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 32, color: theme.ink }}>{a.name}</div>
            </div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── MIND MAP ───────────────────────────
 * Centre idea; branches draw outward to child nodes with curved connectors. */
export const MindMap: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const center = prop(beat, "center", "IDEA");
  const branches = prop<string[]>(beat, "branches", ["Audience", "Offer", "Content", "Distribution", "Systems", "Money"]);
  const cx = 540, cy = 900, R = 360;
  const n = branches.length;
  const cs = pop(frame, fps, 0, "slam");
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {branches.map((_, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (hash01(seed) - 0.5) * 0.4;
          const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 1.25;
          const t = easeOut(frame, 6 + i * 3, 10);
          const mx = cx + Math.cos(a + 0.35) * R * 0.5, my = cy + Math.sin(a + 0.35) * R * 0.6;
          const d = `M ${cx} ${cy} Q ${mx} ${my} ${x} ${y}`;
          return <path key={i} d={d} stroke={theme.accent} strokeWidth={6} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t} />;
        })}
      </svg>
      {branches.map((b, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (hash01(seed) - 0.5) * 0.4;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 1.25;
        const s = pop(frame, fps, 12 + i * 3, "snap");
        return <div key={i} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${s})`, padding: "16px 28px", borderRadius: 999, background: theme.dark ? "#18181C" : "#FFF", border: `4px solid ${theme.accent}`, fontFamily: theme.body, fontWeight: 900, fontSize: 40, color: theme.ink, whiteSpace: "nowrap" }}>{b}</div>;
      })}
      <div style={{ position: "absolute", left: cx, top: cy, transform: `translate(-50%, -50%) scale(${cs})`, width: 300, height: 300, borderRadius: 150, background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: theme.display, fontWeight: 900, fontSize: 64, color: theme.onAccent, boxShadow: `0 0 0 16px ${alpha(theme.accent, 0.25)}` }}>{center}</div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── FUNNEL ───────────────────────────
 * Stacked funnel stages narrow downward; numbers count in; drop-off shown. Marketing/sales breakdowns. */
type Stage = { label: string; value: string };
export const Funnel: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const stages = prop<Stage[]>(beat, "stages", [{ label: "Views", value: "100,000" }, { label: "Profile visits", value: "4,200" }, { label: "Follows", value: "1,300" }, { label: "Customers", value: "86" }]);
  const n = stages.length;
  return (
    <Safe>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {stages.map((s, i) => {
          const t = easeOut(frame, 3 + i * 6, 10);
          const w = 940 - i * (560 / Math.max(1, n - 1));
          return (
            <div key={i} style={{ width: w * t, height: 170, clipPath: "polygon(0 0, 100% 0, 94% 100%, 6% 100%)", background: i === n - 1 ? theme.accent : alpha(theme.accent, 0.25 + (i / n) * 0.5), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 56, color: theme.ink, opacity: t }}>{s.value}</div>
              <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 30, color: alpha(theme.ink, 0.8), opacity: t }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── VENN ───────────────────────────
 * Two circles slide together; the overlap lights up with the "sweet spot" label. */
export const Venn: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const a = prop(beat, "a", "Skills");
  const b = prop(beat, "b", "Demand");
  const mid = prop(beat, "mid", "Money");
  const t = easeInOut(frame, 2, Math.max(12, beat.frames * 0.4));
  const off = interpolate(t, [0, 1], [420, 170]);
  const ms = frame > beat.frames * 0.45 ? pop(frame, fps, Math.floor(beat.frames * 0.45), "slam") : 0;
  const circle = (x: number, label: string, lx: number): React.ReactNode => (
    <>
      <div style={{ position: "absolute", left: 540 + x - 300, top: 900 - 300, width: 600, height: 600, borderRadius: 300, border: `8px solid ${theme.accent}`, background: alpha(theme.accent, 0.12) }} />
      <div style={{ position: "absolute", left: 540 + x + lx - 200, top: 900 - 40, width: 400, textAlign: "center", fontFamily: theme.body, fontWeight: 900, fontSize: 52, color: theme.ink }}>{label}</div>
    </>
  );
  return (
    <AbsoluteFill>
      {circle(-off, a, -110)}
      {circle(off, b, 110)}
      <div style={{ position: "absolute", left: 540 - 130, top: 900 - 70, width: 260, height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: theme.accent, color: theme.onAccent, borderRadius: 24, fontFamily: theme.display, fontWeight: 900, fontSize: 52, transform: `scale(${ms})` }}>{mid}</div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── PYRAMID ───────────────────────────
 * Levels build bottom-up into a pyramid; the top tier glows. Hierarchies, priorities, "most people stop here". */
export const Pyramid: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const levels = prop<string[]>(beat, "levels", ["Consistency", "Skills", "Systems", "Leverage"]);
  const n = levels.length, H = 190, base = 940;
  const step = Math.max(5, Math.floor((beat.frames * 0.6) / Math.max(1, n)));
  return (
    <Safe>
      <div style={{ display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 10 }}>
        {levels.map((l, i) => {
          const s = frame >= 3 + i * step ? pop(frame, fps, 3 + i * step, "snap") : 0;
          const wBot = base - i * (base / (n + 0.4)), wTop = base - (i + 1) * (base / (n + 0.4));
          const inset = ((wBot - wTop) / 2 / wBot) * 100;
          const top = i === n - 1;
          return (
            <div key={i} style={{ width: wBot, height: H, clipPath: `polygon(${inset}% 0, ${100 - inset}% 0, 100% 100%, 0 100%)`, background: top ? theme.accent : alpha(theme.ink, 0.1 + i * 0.07), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.body, fontWeight: 900, fontSize: top ? 46 : 50, color: top ? theme.onAccent : theme.ink, transform: `translateY(${(1 - s) * -300}px)`, opacity: s }}>{l}</div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── QUADRANT ───────────────────────────
 * 2x2 matrix with axis labels; dots pop into quadrants; the hero dot travels to top-right. */
type QDot = { label: string; x: number; y: number };
export const Quadrant: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const xLabel = prop(beat, "xLabel", "Effort →");
  const yLabel = prop(beat, "yLabel", "Impact →");
  const dots = prop<QDot[]>(beat, "dots", [{ label: "Agency", x: 0.85, y: 0.35 }, { label: "Freelancer", x: 0.6, y: 0.3 }, { label: "Templates", x: 0.2, y: 0.2 }]);
  const hero = prop(beat, "hero", "This system");
  const S = 860, ox = 110, oy = 520;
  const ht = easeInOut(frame, Math.floor(beat.frames * 0.4), Math.floor(beat.frames * 0.35));
  const hx = interpolate(ht, [0, 1], [0.5, 0.15]), hy = interpolate(ht, [0, 1], [0.5, 0.9]);
  const pt = (x: number, y: number) => ({ left: ox + x * S, top: oy + (1 - y) * S });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: ox, top: oy, width: S, height: S, border: `3px solid ${alpha(theme.ink, 0.25)}`, opacity: easeOut(frame, 0, 8) }}>
        <div style={{ position: "absolute", left: S / 2, top: 0, bottom: 0, width: 3, background: alpha(theme.ink, 0.2) }} />
        <div style={{ position: "absolute", top: S / 2, left: 0, right: 0, height: 3, background: alpha(theme.ink, 0.2) }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: S / 2, height: S / 2, background: alpha(theme.accent, 0.12) }} />
      </div>
      <div style={{ position: "absolute", left: ox, top: oy + S + 20, width: S, textAlign: "center", fontFamily: theme.mono, fontWeight: 700, fontSize: 32, color: theme.dim }}>{xLabel}</div>
      <div style={{ position: "absolute", left: ox - 70, top: oy + S / 2, transform: "translate(-50%, -50%) rotate(-90deg)", fontFamily: theme.mono, fontWeight: 700, fontSize: 32, color: theme.dim, whiteSpace: "nowrap" }}>{yLabel}</div>
      {dots.map((d, i) => {
        const s = pop(frame, fps, 4 + i * 4, "snap");
        const p = pt(d.x, d.y);
        return <div key={i} style={{ position: "absolute", ...p, transform: `translate(-50%, -50%) scale(${s})`, display: "flex", alignItems: "center", gap: 12, fontFamily: theme.body, fontWeight: 800, fontSize: 32, color: theme.dim, whiteSpace: "nowrap" }}><div style={{ width: 30, height: 30, borderRadius: 15, background: alpha(theme.ink, 0.5) }} />{d.label}</div>;
      })}
      <div style={{ position: "absolute", ...pt(hx, hy), transform: `translate(-50%, -50%) scale(${pop(frame, fps, 8, "slam")})`, display: "flex", alignItems: "center", gap: 14, fontFamily: theme.body, fontWeight: 900, fontSize: 40, color: theme.ink, whiteSpace: "nowrap" }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: theme.accent, boxShadow: `0 0 0 12px ${alpha(theme.accent, 0.3)}` }} />{hero}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── ICEBERG ───────────────────────────
 * The meme: tip above the waterline ("what people see"), the huge mass below fills with hidden layers. */
export const Iceberg: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const top = prop(beat, "top", "The viral reel");
  const below = prop<string[]>(beat, "below", ["600 failed drafts", "Late nights", "Code nobody sees", "Systems"]);
  const water = 720;
  const dive = easeInOut(frame, Math.floor(beat.frames * 0.25), Math.floor(beat.frames * 0.3));
  const camY = -dive * 420;
  const step = Math.max(5, Math.floor((beat.frames * 0.4) / Math.max(1, below.length)));
  const baseAt = Math.floor(beat.frames * 0.4);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${camY}px)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: water, height: 2400, background: `linear-gradient(${alpha(theme.accent, 0.22)}, ${alpha(theme.bg, 0.95)} 70%)` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: water - 4, height: 8, background: alpha(theme.ink, 0.6) }} />
        <svg width={1080} height={2600} style={{ position: "absolute", left: 0, top: 0 }}>
          <polygon points={`540,${water - 230} 650,${water - 60} 700,${water} 380,${water} 430,${water - 90}`} fill="#F4F4F6" />
          <polygon points={`380,${water} 700,${water} 900,${water + 420} 820,${water + 900} 540,${water + 1150} 220,${water + 860} 160,${water + 380}`} fill={alpha("#DDE6EE", 0.18)} stroke={alpha("#DDE6EE", 0.45)} strokeWidth={4} />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: water - 380, textAlign: "center", fontFamily: theme.body, fontWeight: 900, fontSize: 60, color: theme.ink }}>{top}</div>
        {below.map((b, i) => {
          const o = easeOut(frame, baseAt + i * step, 6);
          return <div key={i} style={{ position: "absolute", left: 0, right: 0, top: water + 200 + i * 190, textAlign: "center", fontFamily: theme.body, fontWeight: 800, fontSize: 52, color: theme.ink, opacity: o, transform: `translateY(${(1 - o) * 30}px)` }}>{b}</div>;
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── PIE ───────────────────────────
 * Pie slices sweep in one by one; the biggest slice pops out with its label. */
type Slice = { label: string; value: number };
export const Pie: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const data = prop<Slice[]>(beat, "data", [{ label: "Distribution", value: 60 }, { label: "Content", value: 25 }, { label: "Product", value: 15 }]);
  const total = data.reduce((a, d) => a + (Number(d.value) || 0), 0) || 1;
  const sweep = easeInOut(frame, 3, Math.max(14, beat.frames * 0.45));
  const big = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  const popOut = frame > beat.frames * 0.5 ? pop(frame, fps, Math.floor(beat.frames * 0.5), "snap") : 0;
  const cx = 540, cy = 860, R = 360;
  let acc = 0;
  const shades = [theme.accent, alpha(theme.ink, 0.55), alpha(theme.ink, 0.3), alpha(theme.ink, 0.18), alpha(theme.accent, 0.5)];
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {data.map((d, i) => {
          const a0 = (acc / total) * Math.PI * 2 * sweep - Math.PI / 2;
          acc += Number(d.value) || 0;
          const a1 = (acc / total) * Math.PI * 2 * sweep - Math.PI / 2;
          const mid = (a0 + a1) / 2;
          const off = i === big ? popOut * 40 : 0;
          const ox = Math.cos(mid) * off, oy = Math.sin(mid) * off;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const path = `M ${cx + ox} ${cy + oy} L ${cx + ox + Math.cos(a0) * R} ${cy + oy + Math.sin(a0) * R} A ${R} ${R} 0 ${large} 1 ${cx + ox + Math.cos(a1) * R} ${cy + oy + Math.sin(a1) * R} Z`;
          return (
            <g key={i}>
              <path d={path} fill={i === big ? theme.accent : shades[(i % (shades.length - 1)) + 1]} stroke={theme.bg} strokeWidth={6} />
              {sweep > 0.95 ? <text x={cx + ox + Math.cos(mid) * R * 0.62} y={cy + oy + Math.sin(mid) * R * 0.62 + 16} textAnchor="middle" fontFamily={theme.mono} fontWeight={700} fontSize={44} fill={i === big ? theme.onAccent : theme.ink}>{Math.round((d.value / total) * 100)}%</text> : null}
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", left: 80, right: 80, top: cy + R + 70, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px 36px" }}>
        {data.map((d, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: theme.body, fontWeight: 800, fontSize: 38, color: i === big ? theme.ink : theme.dim, opacity: easeOut(frame, 8 + i * 3, 6) }}><div style={{ width: 26, height: 26, borderRadius: 6, background: i === big ? theme.accent : shades[(i % (shades.length - 1)) + 1] }} />{d.label}</div>)}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── STAT GRID ───────────────────────────
 * 2x2 KPI tiles flip up in sequence, numbers count in. Results recap. */
type Stat = { value: number; prefix?: string; suffix?: string; label: string };
export const StatGrid: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const stats = prop<Stat[]>(beat, "stats", [{ value: 1.2, suffix: "M", label: "views" }, { value: 14, label: "videos / week" }, { value: 0, prefix: "$", label: "monthly cost" }, { value: 92, suffix: "%", label: "watch-through" }]);
  return (
    <Safe>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 440px)", gap: 28, perspective: 1600 }}>
        {stats.slice(0, 4).map((s, i) => {
          const f = pop(frame, fps, 3 + i * 4, "snap");
          const v = s.value * easeOut(frame, 3 + i * 4, 18);
          const txt = Number.isInteger(s.value) ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
          return (
            <div key={i} style={{ height: 380, borderRadius: 34, padding: 36, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: i === 0 ? theme.accent : theme.dark ? "#141418" : "#FFF", border: `2px solid ${alpha(theme.ink, 0.1)}`, transform: `rotateX(${(1 - f) * 90}deg)`, transformOrigin: "50% 100%" }}>
              <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 110, lineHeight: 1, color: i === 0 ? theme.onAccent : theme.ink }}>{s.prefix || ""}{txt}{s.suffix || ""}</div>
              <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 36, color: i === 0 ? alpha(theme.onAccent, 0.85) : theme.dim, marginTop: 10 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </Safe>
  );
};
