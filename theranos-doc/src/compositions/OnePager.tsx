import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Audio } from "remotion";

/**
 * ONE-PAGE REEL — a single animated vertical (9:16) card in the LinkedIn-personal CREATOR style
 * (byline: avatar + name + verified + @handle; near-black premium base; one bold insight). Built for
 * Cohort Zero's daily Instagram Reel: no footage, no captions — just one strong, well-designed idea
 * that reads instantly in the feed. Content comes in via inputProps (see gen_onepager.mjs).
 */

const DISPLAY = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace';

const txt = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(", ");
  return "";
};

export type OnePagerProps = {
  brand?: string;
  name?: string; // byline display name ("Hassan Khan")
  at?: string; // byline handle ("@cohortzero")
  handle?: string;
  avatar?: string; // filename in public/ for the real photo; falls back to a monogram
  accent?: string;
  kicker?: string; // small mono label above the headline
  headline?: string; // the one big idea
  subline?: string; // one supporting sentence
  stat?: string; // optional big number ("83%")
  statLabel?: string; // what the number means
  footer?: string; // bottom-left mono note (e.g. "FOUNDER PLAYBOOK")
  cta?: string; // bottom-right nudge (e.g. "follow for more")
  music?: string; // optional filename in public/music for a low bed
};

const Verified: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <circle cx={12} cy={12} r={11} fill="#1d9bf0" />
    <path d="M7 12.4l3.2 3.1 6.8-6.9" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Avatar: React.FC<{ p: OnePagerProps; size: number }> = ({ p, size }) => {
  const accent = p.accent || "#e11d48";
  const initials = (p.name || p.brand || "CZ").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (p.avatar) {
    return <Img src={staticFile(p.avatar)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `2px solid ${accent}55`, flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${accent}, #1b2536)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: size * 0.38, color: "#fff", border: "2px solid rgba(255,255,255,0.15)", flexShrink: 0 }}>
      {initials}
    </div>
  );
};

// A staggered fade+rise for each block, so the card feels alive (a reel) rather than a static image.
const Rise: React.FC<{ delay: number; children: React.ReactNode; y?: number }> = ({ delay, children, y = 26 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [y, 0])}px)` }}>{children}</div>;
};

export const OnePager: React.FC<OnePagerProps> = (props) => {
  const { width, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const p = props || {};
  const accent = p.accent || "#e11d48";

  // Slow background drift + a gentle end-fade so a looping reel doesn't hard-cut.
  const drift = interpolate(frame, [0, durationInFrames], [1.04, 1.1]);
  const outFade = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const pad = Math.round(width * 0.075);

  return (
    <AbsoluteFill style={{ backgroundColor: "#07090c", fontFamily: DISPLAY, opacity: outFade }}>
      {/* CREATOR base: near-black with a whisper of the accent hue + a soft accent glow. */}
      <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 0%, ${accent}18, rgba(0,0,0,0) 55%), linear-gradient(160deg, #0a0d12, #07090c 60%, #05070a)`, transform: `scale(${drift})` }} />
      <AbsoluteFill style={{ background: `radial-gradient(60% 40% at 50% 42%, ${accent}12, rgba(0,0,0,0) 70%)` }} />

      <AbsoluteFill style={{ padding: pad, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {/* BYLINE — the persistent creator identity. */}
        <Rise delay={0} y={-18}>
          <div style={{ display: "flex", alignItems: "center", gap: width * 0.022 }}>
            <Avatar p={p} size={Math.round(width * 0.11)} />
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ display: "flex", alignItems: "center", gap: width * 0.01, fontFamily: DISPLAY, fontWeight: 700, fontSize: width * 0.042, color: "#f5f7fa" }}>
                {p.name || p.brand || "Cohort Zero"}
                <Verified size={Math.round(width * 0.042)} />
              </div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.03, color: "#7c8896" }}>{p.at || p.handle || ""}</div>
            </div>
          </div>
        </Rise>

        {/* THE ONE IDEA — kicker, headline, supporting line, optional stat. */}
        <div style={{ display: "flex", flexDirection: "column", gap: width * 0.03 }}>
          {p.kicker ? (
            <Rise delay={6}>
              <div style={{ fontFamily: MONO, fontSize: width * 0.032, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: accent }}>{txt(p.kicker)}</div>
            </Rise>
          ) : null}
          <Rise delay={10}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.088, lineHeight: 1.06, letterSpacing: -1.2, color: "#f7f9fb" }}>{txt(p.headline) || "One sharp idea, beautifully said."}</div>
          </Rise>
          {p.stat ? (
            <Rise delay={16}>
              <div style={{ marginTop: width * 0.01, display: "flex", alignItems: "baseline", gap: width * 0.028, flexWrap: "wrap" }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.15, lineHeight: 1, letterSpacing: -3, color: accent, textShadow: `0 0 60px ${accent}55` }}>{txt(p.stat)}</div>
                {p.statLabel ? <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: width * 0.036, color: "#aeb8c6", lineHeight: 1.3, maxWidth: "55%" }}>{txt(p.statLabel)}</div> : null}
              </div>
            </Rise>
          ) : null}
          {p.subline ? (
            <Rise delay={20}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.042, lineHeight: 1.4, color: "#c2ccd6" }}>{txt(p.subline)}</div>
            </Rise>
          ) : null}
        </div>

        {/* FOOTER — brand mark + note, and a follow nudge. */}
        <Rise delay={26} y={18}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: width * 0.03 }}>
            <div style={{ display: "flex", alignItems: "center", gap: width * 0.016 }}>
              <div style={{ width: width * 0.028, height: width * 0.028, borderRadius: 6, background: accent, boxShadow: `0 0 16px ${accent}` }} />
              <span style={{ fontFamily: MONO, fontSize: width * 0.028, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#9aa6b2" }}>{txt(p.footer) || txt(p.brand) || "COHORT ZERO"}</span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: width * 0.028, fontWeight: 700, letterSpacing: 1, color: accent }}>{txt(p.cta) || "follow →"}</span>
          </div>
        </Rise>
      </AbsoluteFill>

      {p.music ? <Audio src={staticFile(`music/${p.music}`)} volume={0.12} /> : null}
    </AbsoluteFill>
  );
};
