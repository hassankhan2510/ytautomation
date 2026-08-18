import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";

/**
 * LINKEDIN diagram primitives — clean, CODE-DRAWN graphics (no AI images) that the content stage
 * composes per slide. Each slide is a full 4:5 card with a consistent frame (brand + page number)
 * and one diagram body. Designed to look like a premium tech-editorial carousel.
 */

const DISPLAY = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace';

export type LiSlide =
  | { type: "cover"; kicker?: string; title: string; sub?: string }
  | { type: "thesis"; label?: string; text: string }
  | { type: "flow"; title?: string; steps: string[] }
  | { type: "stack"; title?: string; layers: { name: string; desc?: string }[] }
  | { type: "compare"; title?: string; left: { title: string; items: string[] }; right: { title: string; items: string[] } }
  | { type: "stat"; value: string; label: string; sub?: string }
  | { type: "bullets"; title?: string; items: string[] }
  | { type: "cta"; title: string; sub?: string };

type Meta = { brand: string; handle?: string; accent: string };

/* ---------- shared frame ---------- */
const Frame: React.FC<{ meta: Meta; page: number; total: number; children: React.ReactNode; footer?: string }> = ({ meta, page, total, children, footer }) => {
  const { width } = useVideoConfig();
  const pad = Math.round(width * 0.085);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #0c141f 0%, #080d14 60%, #05080d 100%)", color: "#f5f7fa" }}>
      {/* soft accent glow */}
      <div style={{ position: "absolute", top: -width * 0.28, right: -width * 0.22, width: width * 0.7, height: width * 0.7, borderRadius: "50%", background: meta.accent, opacity: 0.1, filter: "blur(70px)" }} />
      <AbsoluteFill style={{ padding: pad, justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.026, letterSpacing: 1.5 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: meta.accent, boxShadow: `0 0 16px ${meta.accent}` }} />
            {meta.brand}
          </div>
          <div style={{ fontFamily: MONO, color: "#5b6b7c", fontSize: width * 0.024, fontWeight: 700 }}>
            {String(page).padStart(2, "0")}<span style={{ color: "#3a4453" }}>/{String(total).padStart(2, "0")}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: `${pad * 0.4}px 0` }}>{children}</div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, color: "#5b6b7c", fontSize: width * 0.022, letterSpacing: 1 }}>
          <span>{meta.handle || ""}</span>
          <span style={{ color: meta.accent }}>{footer || ""}</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const kickerEl = (text: string, accent: string, size: number) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
    <div style={{ height: 3, width: 40, background: accent }} />
    <span style={{ fontFamily: MONO, fontSize: size, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: accent }}>{text}</span>
  </div>
);

/* ---------- the slides ---------- */
export const LiSlideView: React.FC<{ slide: LiSlide; meta: Meta; page: number; total: number }> = ({ slide, meta, page, total }) => {
  const { width } = useVideoConfig();
  const a = meta.accent;

  if (slide.type === "cover") {
    return (
      <Frame meta={meta} page={page} total={total} footer="swipe →">
        <div>
          {slide.kicker ? kickerEl(slide.kicker, a, width * 0.026) : null}
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.088, lineHeight: 1.02, letterSpacing: -1.5 }}>{slide.title}</div>
          {slide.sub ? <div style={{ marginTop: 30, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.036, lineHeight: 1.4, color: "#aeb8c6" }}>{slide.sub}</div> : null}
        </div>
      </Frame>
    );
  }

  if (slide.type === "thesis") {
    return (
      <Frame meta={meta} page={page} total={total}>
        <div>
          {kickerEl(slide.label || "MY TAKE", a, width * 0.026)}
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: width * 0.058, lineHeight: 1.28, letterSpacing: -0.5 }}>
            <span style={{ color: a, fontSize: width * 0.09, lineHeight: 0.5 }}>“</span>
            {slide.text}
          </div>
        </div>
      </Frame>
    );
  }

  if (slide.type === "flow") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 44, letterSpacing: -0.5 }}>{slide.title}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {slide.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "stretch", gap: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${a}22`, border: `1.5px solid ${a}`, color: a, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 800, fontSize: width * 0.03 }}>{i + 1}</div>
                {i < slide.steps.length - 1 ? <div style={{ width: 2, flex: 1, minHeight: 18, background: `${a}44`, marginTop: 4 }} /> : null}
              </div>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "22px 26px", fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.032, lineHeight: 1.35, display: "flex", alignItems: "center" }}>{s}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "stack") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 40, letterSpacing: -0.5 }}>{slide.title}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {slide.layers.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, background: "linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))", borderLeft: `5px solid ${a}`, borderRadius: 12, padding: "22px 26px" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.035, minWidth: "38%" }}>{l.name}</div>
              {l.desc ? <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.028, color: "#aeb8c6", lineHeight: 1.35 }}>{l.desc}</div> : null}
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "compare") {
    const col = (p: { title: string; items: string[] }, accentCol: string) => (
      <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `4px solid ${accentCol}`, borderRadius: 16, padding: "28px 26px" }}>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: width * 0.03, letterSpacing: 1.5, textTransform: "uppercase", color: accentCol, marginBottom: 22 }}>{p.title}</div>
        {p.items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 16, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.028, color: "#e7ebf1", lineHeight: 1.35 }}>
            <span style={{ color: accentCol }}>—</span>{it}
          </div>
        ))}
      </div>
    );
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.048, marginBottom: 36, letterSpacing: -0.5 }}>{slide.title}</div> : null}
        <div style={{ display: "flex", gap: 22 }}>{col(slide.left, "#7c8a9c")}{col(slide.right, a)}</div>
      </Frame>
    );
  }

  if (slide.type === "stat") {
    return (
      <Frame meta={meta} page={page} total={total}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.19, lineHeight: 1, letterSpacing: -3, color: a, textShadow: `0 0 60px ${a}55` }}>{slide.value}</div>
          <div style={{ marginTop: 20, fontFamily: DISPLAY, fontWeight: 700, fontSize: width * 0.044 }}>{slide.label}</div>
          {slide.sub ? <div style={{ marginTop: 18, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.03, color: "#aeb8c6", lineHeight: 1.4 }}>{slide.sub}</div> : null}
        </div>
      </Frame>
    );
  }

  if (slide.type === "bullets") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 40, letterSpacing: -0.5 }}>{slide.title}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{ width: 14, height: 14, marginTop: 8, borderRadius: 4, background: a, boxShadow: `0 0 14px ${a}`, flexShrink: 0 }} />
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.035, lineHeight: 1.38, color: "#eef2f7" }}>{it}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  // cta
  return (
    <Frame meta={meta} page={page} total={total}>
      <div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.06, lineHeight: 1.1, letterSpacing: -0.8 }}>{slide.title}</div>
        {slide.sub ? <div style={{ marginTop: 24, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.034, color: "#aeb8c6" }}>{slide.sub}</div> : null}
        <div style={{ marginTop: 44, display: "inline-block", padding: "20px 44px", borderRadius: 999, background: a, color: "#05080d", fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.032 }}>
          + Follow {meta.brand}
        </div>
      </div>
    </Frame>
  );
};
