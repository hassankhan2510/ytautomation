import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { evolvePath } from "@remotion/paths";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, pop } from "../engine/motion";
import { prop, Safe, type PrimitiveProps } from "./common";

const big = (theme: ReturnType<typeof useRender>["theme"], size: number): React.CSSProperties => ({
  fontFamily: theme.display, fontWeight: theme.displayWeight, fontSize: size, lineHeight: 0.95, color: theme.ink,
  textTransform: theme.displayUpper ? "uppercase" : "none",
});

/* ─────────────────────────── METER ───────────────────────────
 * Speedometer: needle swings past the target with overshoot, redline zone glows. */
export const Meter: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const value = Math.max(0, Math.min(100, prop(beat, "value", 92)));
  const label = prop(beat, "label", beat.text);
  const unit = prop(beat, "unit", "%");
  const s = pop(frame, fps, 6, "slam");
  const v = value * s;
  const ang = -120 + (v / 100) * 240;
  const R = 330, cx = 400, cy = 400;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [cx + R * Math.cos(((a - 90) * Math.PI) / 180), cy + R * Math.sin(((a - 90) * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M ${x0} ${y0} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  return (
    <Safe>
      <div style={{ position: "relative", width: 800, height: 640 }}>
        <svg width={800} height={640}>
          <path d={arc(-120, 120)} stroke={alpha(theme.ink, 0.12)} strokeWidth={46} fill="none" strokeLinecap="round" />
          <path d={arc(-120, Math.max(-119.9, ang))} stroke={theme.accent} strokeWidth={46} fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 18px ${alpha(theme.accent, 0.7)})` }} />
          {Array.from({ length: 13 }, (_, i) => {
            const a = ((-120 + i * 20 - 90) * Math.PI) / 180;
            return <line key={i} x1={cx + (R - 60) * Math.cos(a)} y1={cy + (R - 60) * Math.sin(a)} x2={cx + (R - 84) * Math.cos(a)} y2={cy + (R - 84) * Math.sin(a)} stroke={alpha(theme.ink, 0.4)} strokeWidth={5} />;
          })}
          <g transform={`rotate(${ang} ${cx} ${cy})`}>
            <polygon points={`${cx - 14},${cy} ${cx + 14},${cy} ${cx},${cy - R + 70}`} fill={theme.ink} />
          </g>
          <circle cx={cx} cy={cy} r={30} fill={theme.accent} />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: 470, textAlign: "center" }}>
          <div style={{ ...big(theme, 150), color: theme.accent }}>{Math.round(v)}{unit}</div>
          <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 42, color: theme.ink, marginTop: 10 }}>{label}</div>
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── RING ───────────────────────────
 * Donut fills to a percentage; the number counts inside; a spark rides the leading edge. */
export const Ring: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const value = Math.max(0, Math.min(100, prop(beat, "value", 73)));
  const label = prop(beat, "label", beat.text);
  const p = easeInOut(frame, 4, Math.max(18, beat.frames * 0.55)) * value;
  const R = 300, C = 2 * Math.PI * R;
  const a = ((p / 100) * 360 - 90) * (Math.PI / 180);
  return (
    <Safe>
      <div style={{ position: "relative", width: 720, height: 720 }}>
        <svg width={720} height={720} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={360} cy={360} r={R} stroke={alpha(theme.ink, 0.1)} strokeWidth={56} fill="none" />
          <circle cx={360} cy={360} r={R} stroke={theme.accent} strokeWidth={56} fill="none" strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", left: 360 + R * Math.cos(a) - 22, top: 360 + R * Math.sin(a) - 22, width: 44, height: 44, borderRadius: 22, background: "#fff", boxShadow: `0 0 40px 14px ${alpha(theme.accent, 0.8)}`, opacity: p > 1 ? 1 : 0 }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...big(theme, 190) }}>{Math.round(p)}<span style={{ fontSize: 100, color: theme.accent }}>%</span></div>
          <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 38, color: theme.dim, maxWidth: 440, textAlign: "center", marginTop: 8 }}>{label}</div>
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── LINE CHART ───────────────────────────
 * Growth curve draws itself with a glowing pen tip, area fills under it, end value pops. */
export const LineChart: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const data = prop<number[]>(beat, "data", [2, 3, 3, 5, 4, 8, 12, 19, 31, 52]);
  const label = prop(beat, "label", "");
  const end = prop(beat, "end", "");
  const W = 900, H = 640, pad = 30;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const pts = data.map((d, i) => [pad + (i / Math.max(1, data.length - 1)) * (W - pad * 2), H - pad - ((d - min) / (max - min || 1)) * (H - pad * 2)] as const);
  const d = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `${acc} C ${mx} ${py} ${mx} ${y} ${x} ${y}`;
  }, "");
  const t = easeInOut(frame, 4, Math.max(18, beat.frames * 0.65));
  const { strokeDasharray, strokeDashoffset } = evolvePath(t, d);
  const tipIdx = Math.min(pts.length - 1, Math.floor(t * (pts.length - 1) + 0.0001));
  const tip = pts[tipIdx];
  const endPop = pop(frame, fps, Math.floor(4 + beat.frames * 0.65), "slam");
  return (
    <Safe>
      {label ? <div style={{ fontFamily: theme.body, fontWeight: 900, fontSize: 56, color: theme.ink, marginBottom: 30, alignSelf: "flex-start" }}>{label}</div> : null}
      <div style={{ position: "relative", width: W, height: H }}>
        <svg width={W} height={H}>
          <defs>
            <linearGradient id={`lcfill${beat.index}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={theme.accent} stopOpacity={0.35} />
              <stop offset="1" stopColor={theme.accent} stopOpacity={0} />
            </linearGradient>
            <clipPath id={`lcclip${beat.index}`}><rect x={0} y={0} width={pad + t * (W - pad * 2)} height={H} /></clipPath>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke={alpha(theme.ink, 0.08)} strokeWidth={2} strokeDasharray="8 10" />)}
          <path d={`${d} L ${W - pad} ${H} L ${pad} ${H} Z`} fill={`url(#lcfill${beat.index})`} clipPath={`url(#lcclip${beat.index})`} />
          <path d={d} stroke={theme.accent} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{ filter: `drop-shadow(0 0 14px ${alpha(theme.accent, 0.8)})` }} />
        </svg>
        <div style={{ position: "absolute", left: tip[0] - 20, top: tip[1] - 20, width: 40, height: 40, borderRadius: 20, background: "#fff", boxShadow: `0 0 30px 10px ${alpha(theme.accent, 0.8)}` }} />
        {end ? <div style={{ position: "absolute", right: 0, top: pts[pts.length - 1][1] - 150, padding: "14px 26px", borderRadius: 16, background: theme.accent, color: theme.onAccent, fontFamily: theme.mono, fontWeight: 700, fontSize: 52, transform: `scale(${endPop})`, transformOrigin: "right bottom" }}>{end}</div> : null}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── CALENDAR ───────────────────────────
 * Month grid; days get X'd off rapidly up to `day`; today's cell pulses. Streaks, countdowns. */
export const Calendar: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const day = Math.max(1, Math.min(31, prop(beat, "day", 30)));
  const month = prop(beat, "month", "30 DAY STREAK");
  const total = prop(beat, "days", 31);
  const step = Math.max(0.6, (beat.frames * 0.6) / day);
  const pulse = 1 + Math.sin(frame / 4) * 0.06;
  return (
    <Safe>
      <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 40, letterSpacing: 8, color: theme.accent, marginBottom: 30 }}>{month}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 118px)", gap: 12 }}>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const at = 4 + i * step;
          const x = n < day ? easeOut(frame, at, 5) : 0;
          const today = n === day && frame >= 4 + (day - 1) * step;
          return (
            <div key={n} style={{ height: 118, borderRadius: 18, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: today ? theme.accent : alpha(theme.ink, 0.06), fontFamily: theme.body, fontWeight: 800, fontSize: 40, color: today ? theme.onAccent : n < day ? alpha(theme.ink, 0.35) : theme.ink, transform: today ? `scale(${pulse})` : "none", boxShadow: today ? `0 0 40px ${alpha(theme.accent, 0.6)}` : "none" }}>
              {n}
              {x > 0 ? (
                <svg width={118} height={118} style={{ position: "absolute", inset: 0 }}>
                  <line x1={24} y1={24} x2={24 + 70 * Math.min(1, x * 2)} y2={24 + 70 * Math.min(1, x * 2)} stroke={theme.accent} strokeWidth={9} strokeLinecap="round" />
                  {x > 0.5 ? <line x1={94} y1={24} x2={94 - 70 * (x - 0.5) * 2} y2={24 + 70 * (x - 0.5) * 2} stroke={theme.accent} strokeWidth={9} strokeLinecap="round" /> : null}
                </svg>
              ) : null}
            </div>
          );
        })}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── PRICE ───────────────────────────
 * Old price shown, a slash cuts it, new price drops in with a stamp. "$4,000 → $0". */
export const Price: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const was = prop(beat, "was", "$4,000");
  const now = prop(beat, "now", "$0");
  const note = prop(beat, "note", "per month");
  const cutAt = Math.floor(beat.frames * 0.3);
  const cut = easeOut(frame, cutAt, 6);
  const drop = pop(frame, fps, cutAt + 6, "slam");
  return (
    <Safe>
      <div style={{ position: "relative" }}>
        <div style={{ ...big(theme, 170), color: alpha(theme.ink, cut > 0 ? 0.4 : 1), transform: `scale(${1 - cut * 0.25}) translateY(${cut * -40}px)` }}>{was}</div>
        <div style={{ position: "absolute", left: -20, right: -20, top: "48%", height: 16, background: theme.accent, transformOrigin: "left center", transform: `scaleX(${cut}) rotate(-8deg)`, boxShadow: `0 0 24px ${theme.accent}` }} />
      </div>
      <div style={{ ...big(theme, 330), color: theme.accent, marginTop: 20, transform: `translateY(${(1 - drop) * -500}px) scale(${interpolate(drop, [0, 1], [1.4, 1])})`, opacity: frame >= cutAt + 6 ? 1 : 0, textShadow: `0 0 70px ${alpha(theme.accent, 0.5)}` }}>{now}</div>
      <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 44, color: theme.dim, opacity: easeOut(frame, cutAt + 12, 8) }}>{note}</div>
    </Safe>
  );
};

/* ─────────────────────────── CHECKLIST ───────────────────────────
 * Items tick off in sequence: box draws, check strokes in, row gets a soft strike. */
export const Checklist: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const items = prop<string[]>(beat, "items", ["Script", "Voice", "Edit", "Post"]);
  const title = prop(beat, "title", "");
  const step = Math.max(6, Math.floor((beat.frames * 0.75) / Math.max(1, items.length)));
  return (
    <Safe align="start">
      {title ? <div style={{ fontFamily: theme.body, fontWeight: 900, fontSize: 60, color: theme.ink, marginBottom: 40 }}>{title}</div> : null}
      {items.map((it, i) => {
        const at = 4 + i * step;
        const appear = easeOut(frame, at - 4, 6);
        const tick = easeOut(frame, at + 2, 6);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 34, marginBottom: 30, opacity: appear, transform: `translateY(${(1 - appear) * 24}px)` }}>
            <svg width={92} height={92}>
              <rect x={5} y={5} width={82} height={82} rx={20} fill={tick > 0.5 ? theme.accent : "transparent"} stroke={tick > 0 ? theme.accent : alpha(theme.ink, 0.35)} strokeWidth={6} />
              <path d="M 24 48 L 40 64 L 70 30" stroke={theme.onAccent} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={70} strokeDashoffset={70 * (1 - tick)} />
            </svg>
            <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 60, color: tick > 0.9 ? alpha(theme.ink, 0.55) : theme.ink, position: "relative" }}>
              {it}
              <div style={{ position: "absolute", left: 0, top: "55%", height: 5, width: `${tick * 100}%`, background: alpha(theme.ink, 0.5) }} />
            </div>
          </div>
        );
      })}
    </Safe>
  );
};
