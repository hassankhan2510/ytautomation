import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, pop } from "../engine/motion";
import { prop, Safe, WindowChrome, type PrimitiveProps } from "./common";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : Math.round(n).toLocaleString("en-US"));

/* ─────────────────────────── TWEET ───────────────────────────
 * Post card (X/Threads style) flips in; text types; like/repost counters climb; heart bursts. */
export const Tweet: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, handle } = useRender();
  const name = prop(beat, "name", "Cohort Zero");
  const user = prop(beat, "handle", handle || "@cohort_zero");
  const body = prop(beat, "body", beat.text);
  const likes = prop(beat, "likes", 12400);
  const reposts = prop(beat, "reposts", 1830);
  const s = pop(frame, fps, 0, "snap");
  const typed = body.slice(0, Math.floor(Math.max(0, frame - 6) * Math.max(1.6, body.length / (beat.frames * 0.45))));
  const grow = easeOut(frame, Math.floor(beat.frames * 0.45), Math.floor(beat.frames * 0.45));
  const heartAt = Math.floor(beat.frames * 0.5);
  const heart = frame >= heartAt ? pop(frame, fps, heartAt, "slam") : 0;
  const card = theme.dark ? "#101114" : "#FFFFFF";
  const ink = theme.dark ? "#F2F2F3" : "#0F1419";
  const dim = theme.dark ? "#71767B" : "#536471";
  return (
    <Safe>
      <div style={{ width: 920, borderRadius: 34, padding: "40px 44px", background: card, border: `1.5px solid ${alpha(ink, 0.1)}`, boxShadow: "0 40px 100px rgba(0,0,0,0.45)", transform: `perspective(1500px) rotateX(${(1 - s) * 30}deg) translateY(${(1 - s) * 80}px)`, opacity: s, fontFamily: theme.body }}>
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: `linear-gradient(135deg, ${theme.accent}, ${theme.bg2})` }} />
          <div>
            <div style={{ fontSize: 38, fontWeight: 800, color: ink }}>{name} <span style={{ color: "#1D9BF0" }}>✓</span></div>
            <div style={{ fontSize: 30, color: dim }}>{user}</div>
          </div>
        </div>
        <div style={{ marginTop: 28, fontSize: 48, lineHeight: 1.3, fontWeight: 600, color: ink, minHeight: 190, whiteSpace: "pre-wrap" }}>{typed}</div>
        <div style={{ display: "flex", gap: 60, marginTop: 30, paddingTop: 26, borderTop: `1px solid ${alpha(ink, 0.1)}`, fontSize: 32, fontWeight: 700, color: dim }}>
          <span>↻ {fmt(reposts * grow)}</span>
          <span style={{ color: heart > 0 ? theme.accent : dim, display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-block", transform: `scale(${1 + Math.sin(Math.min(1, heart) * Math.PI) * 0.8})` }}>{heart > 0 ? "♥" : "♡"}</span>
            {fmt(likes * grow)}
          </span>
          <span>▥ {fmt(likes * 38 * grow)}</span>
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── COMMENT CTA ───────────────────────────
 * Pinned IG comment slides up: "Comment SYSTEM and I'll DM you the repo". The keyword pulses. */
export const CommentCta: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, handle } = useRender();
  const keyword = prop(beat, "keyword", "SYSTEM");
  const line = prop(beat, "line", `Comment "${keyword}" and I'll DM you the full breakdown`);
  const user = prop(beat, "handle", (handle || "@cohort_zero").replace("@", ""));
  const s = pop(frame, fps, 2, "snap");
  const kw = pop(frame, fps, 14, "slam");
  const pulse = 1 + Math.sin(frame / 4) * 0.04;
  const parts = line.split(keyword);
  return (
    <Safe>
      <div style={{ fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: 150, lineHeight: 0.9, color: theme.accent, textTransform: "uppercase", transform: `scale(${interpolate(kw, [0, 1], [2.2, 1]) * pulse}) rotate(-4deg)`, opacity: Math.min(1, kw * 1.4), textShadow: `0 0 50px ${alpha(theme.accent, 0.55)}`, marginBottom: 70 }}>{keyword}</div>
      <div style={{ width: 920, display: "flex", gap: 24, padding: "30px 34px", borderRadius: 30, background: theme.dark ? "#16171B" : "#FFFFFF", boxShadow: "0 30px 80px rgba(0,0,0,0.4)", transform: `translateY(${(1 - s) * 300}px)`, opacity: s, fontFamily: theme.body }}>
        <div style={{ width: 80, height: 80, borderRadius: 40, flexShrink: 0, background: `linear-gradient(45deg, ${theme.accent}, ${theme.accent2})`, padding: 4 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 40, background: theme.bg2 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: theme.ink }}>{user} <span style={{ color: theme.dim, fontWeight: 600 }}>· 📌 Pinned</span></div>
          <div style={{ fontSize: 38, fontWeight: 600, lineHeight: 1.3, color: theme.ink, marginTop: 6 }}>
            {parts.map((p, i) => (
              <React.Fragment key={i}>{p}{i < parts.length - 1 ? <span style={{ color: theme.accent, fontWeight: 900 }}>{keyword}</span> : null}</React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 26, color: theme.dim, marginTop: 10, fontWeight: 600 }}>Reply · ♥ {fmt(interpolate(frame, [0, beat.frames], [120, 2400]))}</div>
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── POLL ───────────────────────────
 * IG story poll: question sticker, a tap lands, percentages race to the result. */
export const Poll: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const q = prop(beat, "question", beat.text);
  const options = prop<string[]>(beat, "options", ["Yes", "No"]);
  const result = prop<number[]>(beat, "result", [82, 18]);
  const s = pop(frame, fps, 0, "snap");
  const tapAt = Math.floor(beat.frames * 0.35);
  const reveal = easeInOut(frame, tapAt + 2, 16);
  const tap = frame >= tapAt ? pop(frame, fps, tapAt, "snap") : 0;
  const win = result.indexOf(Math.max(...result));
  return (
    <Safe>
      <div style={{ width: 820, borderRadius: 40, overflow: "hidden", background: "#FFFFFF", boxShadow: "0 40px 100px rgba(0,0,0,0.45)", transform: `scale(${interpolate(s, [0, 1], [0.6, 1])}) rotate(${(1 - s) * -8}deg)`, opacity: s, fontFamily: theme.body }}>
        <div style={{ padding: "44px 40px", background: `linear-gradient(135deg, ${theme.accent}, ${theme.bg2})`, color: "#FFFFFF", fontSize: 54, fontWeight: 900, textAlign: "center", lineHeight: 1.15 }}>{q}</div>
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
          {options.map((o, i) => {
            const pct = (result[i] ?? 0) * reveal;
            const lit = i === win;
            return (
              <div key={i} style={{ position: "relative", height: 110, borderRadius: 22, background: "#EFEFF1", overflow: "hidden", transform: i === win && tap ? `scale(${1 - Math.sin(Math.min(1, tap) * Math.PI) * 0.04})` : "none" }}>
                <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: lit ? alpha(theme.accent, 0.9) : "#C9C9CF" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 34px", fontSize: 44, fontWeight: 900, color: "#111" }}>
                  <span>{o}</span>
                  <span style={{ opacity: reveal }}>{Math.round(pct)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── SEARCH ───────────────────────────
 * Google-style search bar: query types, autocomplete suggestions drop, one gets highlighted. */
export const Search: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const query = prop(beat, "query", beat.text.toLowerCase().replace(/[.!?]$/, ""));
  const suggestions = prop<string[]>(beat, "suggestions", [`${query} free`, `${query} 2026`, `${query} for beginners`]);
  const pick = prop(beat, "pick", 0);
  const s = pop(frame, fps, 0, "snap");
  const cps = Math.max(1.2, query.length / (beat.frames * 0.4));
  const typed = query.slice(0, Math.floor(Math.max(0, frame - 5) * cps));
  const doneAt = 5 + query.length / cps;
  const drop = easeOut(frame, doneAt, 10);
  const hi = frame > doneAt + 14 ? pick : -1;
  return (
    <Safe>
      <div style={{ width: 920, transform: `translateY(${(1 - s) * 60}px)`, opacity: s, fontFamily: theme.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "34px 40px", background: "#FFFFFF", borderRadius: drop > 0.05 ? "44px 44px 0 0" : 999, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
          <span style={{ fontSize: 46, color: "#9AA0A6" }}>⌕</span>
          <span style={{ fontSize: 46, fontWeight: 500, color: "#202124", flex: 1 }}>{typed}<span style={{ color: "#1A73E8", opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }}>|</span></span>
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: "0 0 44px 44px", overflow: "hidden", maxHeight: drop * 420, boxShadow: "0 30px 60px rgba(0,0,0,0.35)" }}>
          {suggestions.map((sg, i) => (
            <div key={i} style={{ display: "flex", gap: 24, padding: "26px 40px", fontSize: 40, color: "#202124", background: i === hi ? "#F1F1F3" : "transparent", borderLeft: i === hi ? `8px solid ${theme.accent}` : "8px solid transparent", borderTop: "1px solid #EEE" }}>
              <span style={{ color: "#9AA0A6" }}>⌕</span>
              <span>{sg.startsWith(query) ? <>{query}<b>{sg.slice(query.length)}</b></> : sg}</span>
            </div>
          ))}
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── BROWSER ───────────────────────────
 * URL types, progress bar loads, page sections stagger in (hero, cards). Product/site reveals. */
export const Browser: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const url = prop(beat, "url", "cohortzero.co");
  const headline = prop(beat, "headline", beat.text);
  const cards = prop<string[]>(beat, "cards", ["Script", "Voice", "Edit"]);
  const s = pop(frame, fps, 0, "snap");
  const typed = url.slice(0, Math.floor(Math.max(0, frame - 4) * 1.6));
  const loadAt = 4 + url.length / 1.6;
  const load = easeOut(frame, loadAt, 12);
  const page = (k: number) => easeOut(frame, loadAt + 8 + k * 4, 10);
  return (
    <Safe>
      <div style={{ opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})` }}>
        <WindowChrome theme={theme} title="" width={940}>
          <div style={{ padding: "18px 24px", background: "#17181C" }}>
            <div style={{ padding: "16px 28px", borderRadius: 999, background: "#0B0B0D", fontFamily: theme.mono, fontSize: 28, color: "#C9CBD1" }}>🔒 {typed}</div>
          </div>
          <div style={{ height: 6, width: `${load * 100}%`, background: theme.accent, opacity: load < 1 ? 1 : 0 }} />
          <div style={{ padding: "50px 46px 56px", minHeight: 600, background: theme.bg }}>
            <div style={{ height: 22, width: 160, borderRadius: 11, background: theme.accent, opacity: page(0) }} />
            <div style={{ marginTop: 26, fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: 76, lineHeight: 1, color: theme.ink, textTransform: theme.displayUpper ? "uppercase" : "none", opacity: page(1), transform: `translateY(${(1 - page(1)) * 30}px)` }}>{headline}</div>
            <div style={{ display: "flex", gap: 20, marginTop: 44 }}>
              {cards.map((c, i) => (
                <div key={i} style={{ flex: 1, height: 220, borderRadius: 22, padding: 22, background: alpha(theme.ink, 0.06), border: `1px solid ${alpha(theme.ink, 0.1)}`, opacity: page(2 + i), transform: `translateY(${(1 - page(2 + i)) * 50}px)`, fontFamily: theme.body, fontWeight: 800, fontSize: 32, color: theme.ink }}>
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: alpha(theme.accent, 0.8), marginBottom: 18 }} />{c}
                </div>
              ))}
            </div>
          </div>
        </WindowChrome>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── PHONE ───────────────────────────
 * iPhone frame tilts in and auto-scrolls a feed of items (posts / DMs / results). */
export const Phone: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const items = prop<string[]>(beat, "items", [beat.text, "Day 2 is live", "+1,204 followers", "Brand deal inbound"]);
  const app = prop(beat, "app", "Feed");
  const s = pop(frame, fps, 0, "smooth");
  const scroll = easeInOut(frame, 10, Math.max(20, beat.frames - 16)) * Math.max(0, items.length * 250 - 760);
  return (
    <Safe>
      <div style={{ width: 520, height: 1000, borderRadius: 80, padding: 16, background: "#1A1A1D", boxShadow: `0 60px 140px rgba(0,0,0,0.6), 0 0 0 3px #333, 0 0 80px ${alpha(theme.accent, 0.25)}`, transform: `perspective(1800px) rotateY(${interpolate(s, [0, 1], [-28, -6])}deg) rotateX(${interpolate(s, [0, 1], [12, 3])}deg) scale(${interpolate(s, [0, 1], [0.8, 1])})`, opacity: s }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 74, overflow: "hidden", background: theme.bg, position: "relative", fontFamily: theme.body }}>
          <div style={{ position: "absolute", top: 18, left: "50%", marginLeft: -70, width: 140, height: 40, borderRadius: 20, background: "#000", zIndex: 3 }} />
          <div style={{ padding: "84px 30px 20px", fontSize: 40, fontWeight: 900, color: theme.ink, background: theme.bg, position: "relative", zIndex: 2 }}>{app}</div>
          <div style={{ transform: `translateY(${-scroll}px)`, padding: "0 26px" }}>
            {items.map((it, i) => (
              <div key={i} style={{ height: 226, marginBottom: 24, borderRadius: 30, padding: 28, background: i % 2 ? alpha(theme.ink, 0.06) : alpha(theme.accent, 0.16), border: `1px solid ${alpha(theme.ink, 0.08)}`, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: theme.ink, lineHeight: 1.2 }}>{it}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Safe>
  );
};
