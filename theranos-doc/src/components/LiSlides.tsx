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
  | { type: "architecture"; title?: string; core: string; parts: string[] }
  | { type: "timeline"; title?: string; events: { when: string; what: string }[] }
  | { type: "matrix"; title?: string; xLabel?: string; yLabel?: string; quadrants: { label: string; note?: string }[] }
  | { type: "pillars"; title?: string; columns: { title: string; desc: string }[] }
  | { type: "statGrid"; title?: string; stats: { value: string; label: string }[] }
  | { type: "code"; title?: string; lang?: string; lines: string[] }
  | { type: "checklist"; title?: string; items: { text: string; ok: boolean }[] }
  | { type: "table"; title?: string; headers: [string, string]; rows: [string, string][] }
  | { type: "metricBars"; title?: string; bars: { label: string; value: number }[] }
  | { type: "quote"; text: string; author: string; role?: string }
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

const titleEl = (text: string, width: number) => (
  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 38, letterSpacing: -0.5, lineHeight: 1.1 }}>{text}</div>
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

  if (slide.type === "architecture") {
    const parts = slide.parts.slice(0, 4);
    const n = Math.max(parts.length, 1);
    const svgW = width * 0.78;
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ padding: "22px 42px", borderRadius: 14, background: a, color: "#05080d", fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.038, boxShadow: `0 0 44px ${a}66` }}>{slide.core}</div>
          <svg width={svgW} height={62}>
            <line x1={svgW / 2} y1={0} x2={svgW / 2} y2={26} stroke={a} strokeWidth={2.5} />
            <line x1={svgW * (0.5 / n)} y1={26} x2={svgW * ((n - 0.5) / n)} y2={26} stroke={a} strokeWidth={2.5} />
            {parts.map((_, i) => <line key={i} x1={svgW * ((i + 0.5) / n)} y1={26} x2={svgW * ((i + 0.5) / n)} y2={62} stroke={a} strokeWidth={2.5} />)}
          </svg>
          <div style={{ display: "flex", width: svgW }}>
            {parts.map((p, i) => (
              <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                <div style={{ margin: "0 8px", padding: "18px 16px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: `1px solid ${a}55`, fontFamily: DISPLAY, fontWeight: 600, fontSize: width * 0.024, textAlign: "center", lineHeight: 1.25 }}>{p}</div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    );
  }

  if (slide.type === "timeline") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ position: "relative", paddingLeft: 46 }}>
          <div style={{ position: "absolute", left: 13, top: 8, bottom: 8, width: 2, background: `${a}55` }} />
          {slide.events.slice(0, 5).map((e, i) => (
            <div key={i} style={{ marginBottom: 26, position: "relative" }}>
              <div style={{ position: "absolute", left: -39, top: 4, width: 18, height: 18, borderRadius: "50%", background: a, boxShadow: `0 0 14px ${a}` }} />
              <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: width * 0.026, color: a, letterSpacing: 1 }}>{e.when}</div>
              <div style={{ marginTop: 6, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.03, color: "#e7ebf1", lineHeight: 1.35 }}>{e.what}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "matrix") {
    const q = slide.quadrants.slice(0, 4);
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
          {slide.yLabel ? <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: MONO, color: a, fontSize: width * 0.023, fontWeight: 700, letterSpacing: 2, display: "flex", alignItems: "center" }}>{slide.yLabel}</div> : null}
          <div style={{ flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 14, height: width * 0.62 }}>
              {q.map((item, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "22px 22px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.032, color: a }}>{item.label}</div>
                  {item.note ? <div style={{ marginTop: 8, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.024, color: "#aeb8c6", lineHeight: 1.3 }}>{item.note}</div> : null}
                </div>
              ))}
            </div>
            {slide.xLabel ? <div style={{ textAlign: "center", marginTop: 14, fontFamily: MONO, color: a, fontSize: width * 0.023, fontWeight: 700, letterSpacing: 2 }}>{slide.xLabel}</div> : null}
          </div>
        </div>
      </Frame>
    );
  }

  if (slide.type === "pillars") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", gap: 16 }}>
          {slide.columns.slice(0, 4).map((c, i) => (
            <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `4px solid ${a}`, borderRadius: 14, padding: "26px 22px" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.034, marginBottom: 14, lineHeight: 1.15 }}>{c.title}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.026, color: "#aeb8c6", lineHeight: 1.4 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "statGrid") {
    const st = slide.stats.slice(0, 4);
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "grid", gridTemplateColumns: st.length <= 2 ? "1fr" : "1fr 1fr", gap: 22 }}>
          {st.map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.09, color: a, lineHeight: 1, letterSpacing: -1 }}>{s.value}</div>
              <div style={{ marginTop: 12, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.026, color: "#c7cfda", lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "code") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ background: "#0a0f16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 8, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", alignItems: "center" }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f56" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#27c93f" }} />
            {slide.lang ? <span style={{ marginLeft: 10, fontFamily: MONO, fontSize: width * 0.022, color: "#5b6b7c" }}>{slide.lang}</span> : null}
          </div>
          <div style={{ padding: "24px 26px", fontFamily: MONO, fontSize: width * 0.027, lineHeight: 1.65, color: "#d7dde5" }}>
            {slide.lines.slice(0, 12).map((l, i) => (
              <div key={i} style={{ whiteSpace: "pre-wrap" }}><span style={{ color: "#3a4453", marginRight: 16 }}>{String(i + 1).padStart(2, "0")}</span>{l}</div>
            ))}
          </div>
        </div>
      </Frame>
    );
  }

  if (slide.type === "checklist") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {slide.items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: width * 0.026, background: it.ok ? "#16c78422" : "#ea394322", color: it.ok ? "#16c784" : "#ea3943", border: `1.5px solid ${it.ok ? "#16c784" : "#ea3943"}` }}>{it.ok ? "✓" : "✕"}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.032, lineHeight: 1.35, color: "#eef2f7", marginTop: 3 }}>{it.text}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "table") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", background: `${a}22` }}>
            {slide.headers.map((h, i) => (
              <div key={i} style={{ flex: 1, padding: "18px 22px", fontFamily: MONO, fontWeight: 800, fontSize: width * 0.026, color: i === 1 ? a : "#c7cfda", letterSpacing: 1 }}>{h}</div>
            ))}
          </div>
          {slide.rows.slice(0, 6).map((r, ri) => (
            <div key={ri} style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.07)", background: ri % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
              {r.map((c, ci) => (
                <div key={ci} style={{ flex: 1, padding: "18px 22px", fontFamily: DISPLAY, fontWeight: ci === 0 ? 600 : 500, fontSize: width * 0.026, color: ci === 1 ? "#eef2f7" : "#aeb8c6", lineHeight: 1.3 }}>{c}</div>
              ))}
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "metricBars") {
    const max = Math.max(...slide.bars.map((b) => b.value), 1);
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {slide.bars.slice(0, 5).map((b, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontFamily: DISPLAY, fontWeight: 600, fontSize: width * 0.03 }}>
                <span>{b.label}</span><span style={{ color: a, fontFamily: MONO }}>{b.value}</span>
              </div>
              <div style={{ height: 16, borderRadius: 8, background: "rgba(255,255,255,0.06)" }}>
                <div style={{ height: "100%", width: `${(b.value / max) * 100}%`, borderRadius: 8, background: `linear-gradient(90deg, ${a}, ${a}aa)`, boxShadow: `0 0 16px ${a}55` }} />
              </div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "quote") {
    return (
      <Frame meta={meta} page={page} total={total}>
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: width * 0.052, lineHeight: 1.3, letterSpacing: -0.5 }}>
            <span style={{ color: a, fontSize: width * 0.09, lineHeight: 0.5 }}>“</span>{slide.text}”
          </div>
          <div style={{ marginTop: 28, fontFamily: MONO, fontSize: width * 0.026, color: a, fontWeight: 700 }}>— {slide.author}{slide.role ? <span style={{ color: "#7c8a9c" }}>, {slide.role}</span> : null}</div>
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
