import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeOut, pop } from "../engine/motion";
import { makeRng } from "../engine/rng";
import { prop, Safe, WindowChrome, type PrimitiveProps } from "./common";

/* ─────────────────────────── TERMINAL ───────────────────────────
 * Commands type themselves; output lands line-by-line. Lines: "$ cmd" or plain output strings,
 * or {cmd, out}. Auto-paced to finish inside the beat. */
type TLine = { cmd?: string; out?: string };
const toTLines = (raw: unknown, fallback: string): TLine[] => {
  if (!Array.isArray(raw)) return [{ cmd: fallback }];
  return raw.map((l) => {
    if (typeof l === "string") return l.startsWith("$ ") ? { cmd: l.slice(2) } : { out: l };
    const o = l as TLine;
    return { cmd: o.cmd, out: o.out };
  });
};
export const Terminal: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const lines = toTLines(beat.props?.lines, `echo "${beat.text}"`);
  const title = prop(beat, "title", "zsh — ~/empire");
  const totalChars = lines.reduce((a, l) => a + (l.cmd?.length || 0), 0) || 1;
  const outCount = lines.filter((l) => l.out).length;
  const cps = Math.max(1.1, totalChars / Math.max(10, beat.frames * 0.72 - outCount * 4));
  // Build a schedule: each cmd types, then each out appears 4 frames later.
  let t = 6;
  const sched = lines.map((l) => {
    const s = { ...l, cmdStart: t, cmdEnd: t, outAt: 0 };
    if (l.cmd) { s.cmdEnd = t + l.cmd.length / cps; t = s.cmdEnd + 3; }
    if (l.out) { s.outAt = t + 1; t += 4; }
    return s;
  });
  const win = pop(frame, fps, 0, "snap");
  const visible = sched.filter((s) => frame >= s.cmdStart - 1 || (s.out && frame >= s.outAt));
  const shown = visible.slice(-11);
  const cursorOn = Math.floor(frame / 8) % 2 === 0;
  return (
    <Safe>
      <div style={{ transform: `scale(${interpolate(win, [0, 1], [0.9, 1])}) translateY(${(1 - win) * 40}px)`, opacity: win }}>
        <WindowChrome theme={theme} title={title} width={920}>
          <div style={{ padding: "30px 34px 40px", minHeight: 560, fontFamily: theme.mono, fontSize: 38, lineHeight: 1.5, color: "#E8E8EA" }}>
            {shown.map((s, i) => {
              const typed = s.cmd ? s.cmd.slice(0, Math.max(0, Math.floor((frame - s.cmdStart) * cps))) : "";
              const typing = s.cmd && frame < s.cmdEnd;
              return (
                <div key={i}>
                  {s.cmd ? (
                    <div>
                      <span style={{ color: theme.accent, fontWeight: 700 }}>➜ </span>
                      <span style={{ color: "#7AA2F7" }}>~ </span>
                      <span>{typed}</span>
                      {typing && cursorOn ? <span style={{ background: theme.accent, color: theme.onAccent }}>&nbsp;</span> : null}
                    </div>
                  ) : null}
                  {s.out && frame >= s.outAt ? <div style={{ color: s.out.startsWith("✓") || s.out.startsWith("+") ? "#7CE38B" : "#9A9CA5" }}>{s.out}</div> : null}
                </div>
              );
            })}
            {sched.length && frame > (sched[sched.length - 1].outAt || sched[sched.length - 1].cmdEnd) ? (
              <div><span style={{ color: theme.accent, fontWeight: 700 }}>➜ </span><span style={{ color: "#7AA2F7" }}>~ </span>{cursorOn ? <span style={{ background: theme.accent }}>&nbsp;</span> : null}</div>
            ) : null}
          </div>
        </WindowChrome>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── CODE ───────────────────────────
 * Editor window, line numbers, lightweight syntax highlighting, lines type in. */
const KW = /\b(const|let|var|function|return|import|from|export|await|async|if|else|for|while|new|class|def|in|of|true|false|null|None)\b/;
const tokenizeCode = (line: string) => {
  const parts: { t: string; c: string }[] = [];
  const re = /(\/\/.*$|#.*$|"[^"]*"|'[^']*'|`[^`]*`|\b\d+(\.\d+)?\b|\b[A-Za-z_]\w*\b|\s+|.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const t = m[0];
    let c = "base";
    if (/^(\/\/|#)/.test(t)) c = "comment";
    else if (/^["'`]/.test(t)) c = "string";
    else if (/^\d/.test(t)) c = "number";
    else if (KW.test(t) && t.match(KW)?.[0] === t) c = "kw";
    else if (/^[A-Z]/.test(t)) c = "type";
    parts.push({ t, c });
  }
  return parts;
};
export const Code: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const lines = prop<string[]>(beat, "lines", ["const empire = build({ cost: 0 })", "await empire.ship() // daily"]);
  const file = prop(beat, "file", "engine.ts");
  const total = lines.reduce((a, l) => a + l.length, 0) || 1;
  const cps = Math.max(1.4, total / Math.max(10, beat.frames * 0.7));
  const typed = Math.floor(Math.max(0, frame - 6) * cps);
  const colors: Record<string, string> = { kw: theme.accent, string: "#9ECE6A", number: "#FF9E64", comment: "#5C6370", type: "#7DCFFF", base: "#E6E6EA" };
  let budget = typed;
  const win = pop(frame, fps, 0, "snap");
  return (
    <Safe>
      <div style={{ opacity: win, transform: `perspective(1400px) rotateX(${(1 - win) * 18}deg) scale(${interpolate(win, [0, 1], [0.92, 1])})` }}>
        <WindowChrome theme={theme} title={file} width={940}>
          <div style={{ padding: "28px 0 40px", minHeight: 500, fontFamily: theme.mono, fontSize: 36, lineHeight: 1.55 }}>
            {lines.map((ln, i) => {
              const take = Math.max(0, Math.min(ln.length, budget));
              budget -= ln.length;
              if (take <= 0 && i > 0) return null;
              let used = 0;
              const toks = tokenizeCode(ln);
              const active = take > 0 && take < ln.length;
              return (
                <div key={i} style={{ display: "flex", background: active ? alpha(theme.accent, 0.08) : "transparent" }}>
                  <span style={{ width: 76, textAlign: "right", paddingRight: 24, color: "#4B4F58" }}>{i + 1}</span>
                  <span style={{ whiteSpace: "pre" }}>
                    {toks.map((tk, k) => {
                      const rem = take - used;
                      used += tk.t.length;
                      if (rem <= 0) return null;
                      return <span key={k} style={{ color: colors[tk.c], fontStyle: tk.c === "comment" ? "italic" : "normal" }}>{tk.t.slice(0, rem)}</span>;
                    })}
                    {active && Math.floor(frame / 7) % 2 === 0 ? <span style={{ color: theme.accent }}>▍</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </WindowChrome>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── NOTIFICATIONS ───────────────────────────
 * iOS banners stack in from the top — the dopamine-hit visual ("+1,000 subscribers", "$2,400 received"). */
type Notif = { app: string; title: string; body?: string; color?: string; icon?: string };
export const Notifs: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const items = prop<Notif[]>(beat, "items", [{ app: "YouTube", title: "New subscriber", body: beat.text, color: "#FF0033", icon: "▶" }]);
  const gap = Math.max(6, Math.floor((beat.frames * 0.7) / Math.max(1, items.length)));
  const glass = theme.dark ? "rgba(38,38,42,0.82)" : "rgba(255,255,255,0.86)";
  const ink = theme.dark ? "#FFFFFF" : "#111111";
  return (
    <Safe style={{ justifyContent: "flex-start", paddingTop: 260 }}>
      <div style={{ width: 920, position: "relative" }}>
        {items.map((n, i) => {
          const at = 4 + i * gap;
          const s = pop(frame, fps, at, "snap");
          if (frame < at) return null;
          const newer = items.filter((_, j) => j > i && frame >= 4 + j * gap).length;
          const y = newer * 178;
          return (
            <div key={i} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${y + (1 - s) * -260}px) scale(${interpolate(s, [0, 1], [0.9, 1]) * (1 - newer * 0.03)})`, opacity: Math.min(1, s * 1.3) * (1 - newer * 0.12), zIndex: 100 + i }}>
              <div style={{ display: "flex", gap: 26, alignItems: "center", padding: "26px 30px", borderRadius: 40, background: glass, backdropFilter: "blur(24px)", boxShadow: "0 20px 50px rgba(0,0,0,0.35)", border: `1px solid ${alpha("#FFFFFF", theme.dark ? 0.08 : 0.5)}` }}>
                <div style={{ width: 92, height: 92, borderRadius: 24, flexShrink: 0, background: n.color || theme.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: theme.body, fontWeight: 900, fontSize: 44 }}>{n.icon || n.app.slice(0, 1)}</div>
                <div style={{ flex: 1, minWidth: 0, fontFamily: theme.body }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: alpha(ink, 0.6), fontSize: 26, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                    <span>{n.app}</span><span style={{ textTransform: "none" }}>now</span>
                  </div>
                  <div style={{ color: ink, fontSize: 36, fontWeight: 800, marginTop: 4 }}>{n.title}</div>
                  {n.body ? <div style={{ color: alpha(ink, 0.75), fontSize: 30, fontWeight: 500, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.body}</div> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── CHAT ───────────────────────────
 * DM thread with typing indicators before each bubble — story-telling via messages. */
type Msg = { from: "me" | "them"; text: string };
export const Chat: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const msgs = prop<Msg[]>(beat, "messages", [{ from: "them", text: "how is this free??" }, { from: "me", text: beat.text }]);
  const name = prop(beat, "name", "founder");
  const step = Math.max(10, Math.floor((beat.frames * 0.8) / Math.max(1, msgs.length)));
  const typingFor = Math.min(10, Math.floor(step * 0.45));
  const other = theme.dark ? "#26262B" : "#E9E9EC";
  return (
    <Safe>
      <div style={{ width: 900, fontFamily: theme.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 34, opacity: easeOut(frame, 0, 8) }}>
          <div style={{ width: 76, height: 76, borderRadius: 38, background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})` }} />
          <div style={{ color: theme.ink, fontSize: 38, fontWeight: 800 }}>{name}<div style={{ color: "#3DDC84", fontSize: 24, fontWeight: 600 }}>active now</div></div>
        </div>
        {msgs.map((m, i) => {
          const at = 4 + i * step;
          const bubbleAt = at + typingFor;
          if (frame < at) return null;
          const me = m.from === "me";
          const s = pop(frame, fps, bubbleAt, "snap");
          const typing = frame < bubbleAt;
          return (
            <div key={i} style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start", marginBottom: 18 }}>
              {typing ? (
                <div style={{ padding: "26px 32px", borderRadius: 40, background: me ? alpha(theme.accent, 0.5) : other, display: "flex", gap: 10 }}>
                  {[0, 1, 2].map((d) => (
                    <div key={d} style={{ width: 16, height: 16, borderRadius: 8, background: me ? theme.onAccent : theme.dim, transform: `translateY(${Math.sin((frame + d * 4) / 3) * 5}px)` }} />
                  ))}
                </div>
              ) : (
                <div style={{ maxWidth: 680, padding: "22px 32px", borderRadius: 40, borderBottomRightRadius: me ? 10 : 40, borderBottomLeftRadius: me ? 40 : 10, background: me ? theme.accent : other, color: me ? theme.onAccent : theme.ink, fontSize: 38, fontWeight: 600, lineHeight: 1.3, transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`, transformOrigin: me ? "right bottom" : "left bottom", opacity: s }}>{m.text}</div>
              )}
            </div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── GITHUB GRID ───────────────────────────
 * The contribution graph fills in a sweep, intensity climbing toward "now" — proof of work. */
export const GhGrid: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const count = prop(beat, "count", 1247);
  const label = prop(beat, "label", "contributions in the last year");
  const cols = 22, rows = 7, cell = 34, gapPx = 7;
  const r = makeRng(count);
  const levels = Array.from({ length: cols * rows }, (_, k) => {
    const c = Math.floor(k / rows);
    const growth = c / cols;
    const v = r.next() * 0.55 + growth * 0.75;
    return v < 0.35 ? 0 : v < 0.6 ? 1 : v < 0.8 ? 2 : v < 1 ? 3 : 4;
  });
  const sweep = easeOut(frame, 3, Math.max(16, beat.frames * 0.6)) * (cols + 2);
  const shown = Math.round(count * easeOut(frame, 3, Math.max(16, beat.frames * 0.6)));
  return (
    <Safe>
      <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 120, color: theme.accent, textShadow: `0 0 40px ${alpha(theme.accent, 0.5)}` }}>{shown.toLocaleString("en-US")}</div>
      <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 34, color: theme.dim, marginBottom: 40, letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoFlow: "column", gridTemplateRows: `repeat(${rows}, ${cell}px)`, gap: gapPx, padding: 26, borderRadius: 24, background: alpha(theme.ink, 0.04), border: `1px solid ${alpha(theme.ink, 0.08)}` }}>
        {levels.map((lv, k) => {
          const c = Math.floor(k / rows);
          const on = interpolate(sweep - c, [0, 1.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const lvA = [0.06, 0.3, 0.55, 0.8, 1][lv];
          return <div key={k} style={{ width: cell, height: cell, borderRadius: 7, background: lv === 0 ? alpha(theme.ink, 0.07) : alpha(theme.accent, lvA * on + 0.06 * (1 - on)), transform: `scale(${0.6 + on * 0.4})` }} />;
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── DAY STAMP ───────────────────────────
 * The series identity: "DAY 01" rubber-stamps onto the screen with a shockwave. */
export const DayStamp: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const day = String(prop(beat, "day", 1)).padStart(2, "0");
  const title = prop(beat, "title", beat.text);
  const s = pop(frame, fps, 3, "slam");
  const ring = easeOut(frame, 6, 18);
  const sub = easeOut(frame, 12, 12);
  return (
    <Safe>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 700, height: 700, marginLeft: -350, marginTop: -350, borderRadius: 350, border: `6px solid ${theme.accent}`, transform: `scale(${0.3 + ring * 1.4})`, opacity: (1 - ring) * 0.8 }} />
        <div style={{ transform: `scale(${interpolate(s, [0, 1], [3.2, 1])}) rotate(${interpolate(s, [0, 1], [-18, -5])}deg)`, opacity: Math.min(1, s * 1.5), border: `10px solid ${theme.accent}`, padding: "10px 48px 18px", borderRadius: 26, boxShadow: `0 0 60px ${alpha(theme.accent, 0.4)}` }}>
          <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 56, letterSpacing: 18, color: theme.accent, textAlign: "center" }}>DAY</div>
          <div style={{ fontFamily: theme.display === theme.mono ? theme.display : theme.display, fontWeight: theme.displayWeight, fontSize: 300, lineHeight: 0.95, color: theme.ink, textAlign: "center", letterSpacing: -6 }}>{day}</div>
        </div>
        <div style={{ marginTop: 56, maxWidth: 860, textAlign: "center", fontFamily: theme.body, fontWeight: 800, fontSize: 54, lineHeight: 1.18, color: theme.ink, opacity: sub, transform: `translateY(${(1 - sub) * 26}px)` }}>{title}</div>
      </div>
    </Safe>
  );
};
