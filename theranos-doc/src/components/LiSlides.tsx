import React from "react";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";

/**
 * LINKEDIN diagram primitives — clean, CODE-DRAWN graphics (no AI images) that the content stage
 * composes per slide. Each slide is a full 4:5 card with a consistent frame (brand + page number)
 * and one diagram body. Designed to look like a premium tech-editorial carousel.
 */

const DISPLAY = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace';

/**
 * Coerce ANY value into a safe string child. The content stage is fed by an LLM whose JSON can
 * drift from the schema (e.g. an item that should be a string arrives as {name, desc}). Rendering
 * such an object directly crashes React (#31 "objects are not valid as a React child"). This guard
 * makes every slide render bulletproof regardless of what the model returns.
 */
const txt = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    const desc = typeof o.desc === "string" ? o.desc : "";
    if (name && desc) return `${name} — ${desc}`;
    for (const k of ["text", "name", "label", "title", "value", "desc", "what", "step", "item", "point"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    return Object.values(o).filter((x) => typeof x === "string").join(" — ");
  }
  return String(v);
};
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

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

type Meta = {
  brand: string; handle?: string; accent: string;
  bg?: [string, string, string]; angle?: number;
  motif?: string; // background texture: plain | grid | rays | rings
  cover?: string; // cover layout: standard | centered | rule | mark
  shape?: string; // marker shape: square | circle | diamond
  name?: string;   // author display name shown in the byline ("Hassan Khan")
  at?: string;     // author handle ("@hassankhan")
  avatar?: string; // filename in public/ for the real profile photo; falls back to a monogram
};

// Blue "verified" seal — a persistent byline signal that a real creator made this.
const Verified: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <circle cx={12} cy={12} r={11} fill="#1d9bf0" />
    <path d="M7 12.4l3.2 3.1 6.8-6.9" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Profile avatar: the real photo from public/ if provided, else a clean monogram in the accent colour.
const Avatar: React.FC<{ meta: Meta; size: number }> = ({ meta, size }) => {
  const initials = (meta.name || meta.brand || "HK").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (meta.avatar) {
    return <Img src={staticFile(meta.avatar)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `2px solid ${meta.accent}55`, flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${meta.accent}, #1b2536)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: size * 0.38, color: "#fff", border: "2px solid rgba(255,255,255,0.15)", flexShrink: 0 }}>
      {initials}
    </div>
  );
};

// The persistent author byline shown at the top of every slide (avatar + name + verified + @handle).
const Byline: React.FC<{ meta: Meta; width: number }> = ({ meta, width }) => (
  <div style={{ display: "flex", alignItems: "center", gap: width * 0.02 }}>
    <Avatar meta={meta} size={Math.round(width * 0.085)} />
    <div style={{ lineHeight: 1.15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: width * 0.008, fontFamily: DISPLAY, fontWeight: 700, fontSize: width * 0.032, color: "#f5f7fa" }}>
        {meta.name || meta.brand}
        <Verified size={Math.round(width * 0.032)} />
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.024, color: "#6b7684" }}>{meta.at || meta.handle || ""}</div>
    </div>
  </div>
);

// A small shape used for the brand mark + bullet markers, so the accent motif is consistent per post.
const Mark: React.FC<{ shape?: string; size: number; color: string; glow?: boolean }> = ({ shape, size, color, glow }) => {
  const base = { width: size, height: size, background: color, boxShadow: glow ? `0 0 16px ${color}` : undefined, flexShrink: 0 } as React.CSSProperties;
  if (shape === "circle") return <div style={{ ...base, borderRadius: "50%" }} />;
  if (shape === "diamond") return <div style={{ ...base, borderRadius: 2, transform: "rotate(45deg)" }} />;
  return <div style={{ ...base, borderRadius: 4 }} />; // square (default)
};

// A very faint accent-tinted background texture — rotates per post for another axis of variety.
const Motif: React.FC<{ motif?: string; width: number; height: number; accent: string }> = ({ motif, width, height, accent }) => {
  if (!motif || motif === "plain") return null;
  if (motif === "grid") {
    const gap = Math.round(width * 0.06);
    return (
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.06 }}>
        <defs><pattern id="mgrid" width={gap} height={gap} patternUnits="userSpaceOnUse"><circle cx={2} cy={2} r={2} fill={accent} /></pattern></defs>
        <rect width={width} height={height} fill="url(#mgrid)" />
      </svg>
    );
  }
  if (motif === "rays") {
    const gap = Math.round(width * 0.09);
    const lines = [];
    for (let x = -height; x < width; x += gap) lines.push(<line key={x} x1={x} y1={height} x2={x + height} y2={0} stroke={accent} strokeWidth={1.5} />);
    return <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.05 }}>{lines}</svg>;
  }
  if (motif === "rings") {
    const cx = width * 0.86, cy = height * 0.14;
    return (
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.08 }}>
        {[0.12, 0.2, 0.3, 0.42].map((r, i) => <circle key={i} cx={cx} cy={cy} r={width * r} fill="none" stroke={accent} strokeWidth={1.5} />)}
      </svg>
    );
  }
  return null;
};

/* ---------- shared frame ---------- */
const Frame: React.FC<{ meta: Meta; page: number; total: number; children: React.ReactNode; footer?: string }> = ({ meta, page, total, children, footer }) => {
  const { width, height } = useVideoConfig();
  const pad = Math.round(width * 0.085);
  // Per-post theme (rotated by the content engine): a tinted dark gradient + accent glow. Keeps each
  // carousel visually distinct so the feed doesn't look like the same post every time.
  // CREATOR look: a clean near-black base (a whisper of the accent hue), so the byline + big type carry
  // the slide — reads like a real person's carousel, not a template. The accent still rotates per post
  // for highlights (dots, numbers, kickers), so the feed stays varied without looking busy.
  const bg = meta.bg || ["#0c0e13", "#08090d", "#050609"];
  const angle = meta.angle ?? 160;
  const glowLeft = page % 2 === 0;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${bg[0]} 0%, ${bg[1]} 60%, ${bg[2]} 100%)`, color: "#f5f7fa" }}>
      {/* soft accent glow (position alternates per slide) */}
      <div style={{ position: "absolute", top: -width * 0.28, [glowLeft ? "left" : "right"]: -width * 0.22, width: width * 0.7, height: width * 0.7, borderRadius: "50%", background: meta.accent, opacity: 0.1, filter: "blur(70px)" }} />
      {/* rotating background motif (plain/grid/rays/rings) — subtle per-post texture */}
      <Motif motif={meta.motif} width={width} height={height} accent={meta.accent} />
      <AbsoluteFill style={{ padding: pad, justifyContent: "space-between" }}>
        {/* AUTHOR HEADER — avatar + name + verified + handle on every slide, page counter on the right */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Byline meta={meta} width={width} />
          <div style={{ fontFamily: MONO, color: "#5b6b7c", fontSize: width * 0.024, fontWeight: 700 }}>
            {String(page).padStart(2, "0")}<span style={{ color: "#3a4453" }}>/{String(total).padStart(2, "0")}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: `${pad * 0.4}px 0` }}>{children}</div>

        {/* FOOTER — page dots (active = accent) + swipe cue */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: width * 0.014 }}>
            {Array.from({ length: Math.min(total, 12) }, (_, k) => (
              <div key={k} style={{ width: width * 0.014, height: width * 0.014, borderRadius: "50%", background: k === page - 1 ? meta.accent : "rgba(255,255,255,0.22)" }} />
            ))}
          </div>
          <span style={{ fontFamily: MONO, color: meta.accent, fontSize: width * 0.024, fontWeight: 700, letterSpacing: 1 }}>{footer || ""}</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const kickerEl = (text: string, accent: string, size: number) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
    <div style={{ height: 3, width: 40, background: accent }} />
    <span style={{ fontFamily: MONO, fontSize: size, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: accent }}>{txt(text)}</span>
  </div>
);

const titleEl = (text: string, width: number) => (
  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 38, letterSpacing: -0.5, lineHeight: 1.1 }}>{txt(text)}</div>
);

/* ---------- the slides ---------- */
export const LiSlideView: React.FC<{ slide: LiSlide; meta: Meta; page: number; total: number }> = ({ slide, meta, page, total }) => {
  const { width } = useVideoConfig();
  const a = meta.accent;

  if (slide.type === "cover") {
    const cover = meta.cover || "standard";
    const kick = slide.kicker ? txt(slide.kicker) : "";
    const titleNode = (size: number) => <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * size, lineHeight: 1.02, letterSpacing: -1.5 }}>{txt(slide.title)}</div>;
    const subNode = (center: boolean) => (slide.sub ? <div style={{ marginTop: 30, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.036, lineHeight: 1.4, color: "#aeb8c6", textAlign: center ? "center" : "left" }}>{txt(slide.sub)}</div> : null);
    const kickMono = (mb: number) => (kick ? <div style={{ fontFamily: MONO, fontSize: width * 0.026, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: a, marginBottom: mb }}>{kick}</div> : null);
    let body;
    if (cover === "centered") {
      body = (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {kickMono(24)}{titleNode(0.092)}{subNode(true)}
        </div>
      );
    } else if (cover === "rule") {
      body = (
        <div style={{ display: "flex", gap: 28, alignItems: "stretch" }}>
          <div style={{ width: 10, borderRadius: 6, background: a, boxShadow: `0 0 26px ${a}88`, minHeight: width * 0.4 }} />
          <div>{kickMono(20)}{titleNode(0.082)}{subNode(false)}</div>
        </div>
      );
    } else if (cover === "mark") {
      body = (
        <div>
          <div style={{ marginBottom: 34 }}><Mark shape={meta.shape} size={Math.round(width * 0.15)} color={a} glow /></div>
          {kick ? kickerEl(kick, a, width * 0.026) : null}{titleNode(0.084)}{subNode(false)}
        </div>
      );
    } else {
      body = (
        <div>{kick ? kickerEl(kick, a, width * 0.026) : null}{titleNode(0.088)}{subNode(false)}</div>
      );
    }
    return <Frame meta={meta} page={page} total={total} footer="swipe →">{body}</Frame>;
  }

  if (slide.type === "thesis") {
    return (
      <Frame meta={meta} page={page} total={total}>
        <div>
          {kickerEl(slide.label || "MY TAKE", a, width * 0.026)}
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: width * 0.058, lineHeight: 1.28, letterSpacing: -0.5 }}>
            <span style={{ color: a, fontSize: width * 0.09, lineHeight: 0.5 }}>“</span>
            {txt(slide.text)}
          </div>
        </div>
      </Frame>
    );
  }

  if (slide.type === "flow") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 44, letterSpacing: -0.5 }}>{txt(slide.title)}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {slide.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "stretch", gap: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${a}22`, border: `1.5px solid ${a}`, color: a, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 800, fontSize: width * 0.03 }}>{i + 1}</div>
                {i < slide.steps.length - 1 ? <div style={{ width: 2, flex: 1, minHeight: 18, background: `${a}44`, marginTop: 4 }} /> : null}
              </div>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: "22px 26px", fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.032, lineHeight: 1.35, display: "flex", alignItems: "center" }}>{txt(s)}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "stack") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 40, letterSpacing: -0.5 }}>{txt(slide.title)}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {slide.layers.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, background: "linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))", borderLeft: `5px solid ${a}`, borderRadius: 12, padding: "22px 26px" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.035, minWidth: "38%" }}>{typeof l === "string" ? txt(l) : txt(l.name)}</div>
              {typeof l !== "string" && l.desc ? <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.028, color: "#aeb8c6", lineHeight: 1.35 }}>{txt(l.desc)}</div> : null}
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "compare") {
    const col = (p: { title: string; items: string[] }, accentCol: string) => (
      <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.11)", borderTop: `4px solid ${accentCol}`, borderRadius: 16, padding: "28px 26px" }}>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: width * 0.03, letterSpacing: 1.5, textTransform: "uppercase", color: accentCol, marginBottom: 22 }}>{txt(p.title)}</div>
        {(p.items || []).map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 16, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.028, color: "#e7ebf1", lineHeight: 1.35 }}>
            <span style={{ color: accentCol }}>—</span>{txt(it)}
          </div>
        ))}
      </div>
    );
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.048, marginBottom: 36, letterSpacing: -0.5 }}>{txt(slide.title)}</div> : null}
        <div style={{ display: "flex", gap: 22 }}>{col(slide.left, "#7c8a9c")}{col(slide.right, a)}</div>
      </Frame>
    );
  }

  if (slide.type === "stat") {
    return (
      <Frame meta={meta} page={page} total={total}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.19, lineHeight: 1, letterSpacing: -3, color: a, textShadow: `0 0 60px ${a}55` }}>{txt(slide.value)}</div>
          <div style={{ marginTop: 20, fontFamily: DISPLAY, fontWeight: 700, fontSize: width * 0.044 }}>{txt(slide.label)}</div>
          {slide.sub ? <div style={{ marginTop: 18, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.03, color: "#aeb8c6", lineHeight: 1.4 }}>{txt(slide.sub)}</div> : null}
        </div>
      </Frame>
    );
  }

  if (slide.type === "bullets") {
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.05, marginBottom: 40, letterSpacing: -0.5 }}>{txt(slide.title)}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {(slide.items || []).map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{ marginTop: 8 }}><Mark shape={meta.shape} size={14} color={a} glow /></div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.035, lineHeight: 1.38, color: "#eef2f7" }}>{txt(it)}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "architecture") {
    const parts = (slide.parts || []).slice(0, 4);
    const n = Math.max(parts.length, 1);
    const svgW = width * 0.78;
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ padding: "22px 42px", borderRadius: 14, background: a, color: "#05080d", fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.038, boxShadow: `0 0 44px ${a}66` }}>{txt(slide.core)}</div>
          <svg width={svgW} height={62}>
            <line x1={svgW / 2} y1={0} x2={svgW / 2} y2={26} stroke={a} strokeWidth={2.5} />
            <line x1={svgW * (0.5 / n)} y1={26} x2={svgW * ((n - 0.5) / n)} y2={26} stroke={a} strokeWidth={2.5} />
            {parts.map((_, i) => <line key={i} x1={svgW * ((i + 0.5) / n)} y1={26} x2={svgW * ((i + 0.5) / n)} y2={62} stroke={a} strokeWidth={2.5} />)}
          </svg>
          <div style={{ display: "flex", width: svgW }}>
            {parts.map((p, i) => (
              <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                <div style={{ margin: "0 8px", padding: "18px 16px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: `1px solid ${a}55`, fontFamily: DISPLAY, fontWeight: 600, fontSize: width * 0.024, textAlign: "center", lineHeight: 1.25 }}>{txt(p)}</div>
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
          {(slide.events || []).slice(0, 5).map((e, i) => (
            <div key={i} style={{ marginBottom: 26, position: "relative" }}>
              <div style={{ position: "absolute", left: -39, top: 4, width: 18, height: 18, borderRadius: "50%", background: a, boxShadow: `0 0 14px ${a}` }} />
              <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: width * 0.026, color: a, letterSpacing: 1 }}>{txt(e.when)}</div>
              <div style={{ marginTop: 6, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.03, color: "#e7ebf1", lineHeight: 1.35 }}>{txt(e.what)}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "matrix") {
    const q = (slide.quadrants || []).slice(0, 4);
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
          {slide.yLabel ? <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: MONO, color: a, fontSize: width * 0.023, fontWeight: 700, letterSpacing: 2, display: "flex", alignItems: "center" }}>{txt(slide.yLabel)}</div> : null}
          <div style={{ flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 14, height: width * 0.62 }}>
              {q.map((item, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 12, padding: "22px 22px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.032, color: a }}>{txt(item.label)}</div>
                  {item.note ? <div style={{ marginTop: 8, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.024, color: "#aeb8c6", lineHeight: 1.3 }}>{txt(item.note)}</div> : null}
                </div>
              ))}
            </div>
            {slide.xLabel ? <div style={{ textAlign: "center", marginTop: 14, fontFamily: MONO, color: a, fontSize: width * 0.023, fontWeight: 700, letterSpacing: 2 }}>{txt(slide.xLabel)}</div> : null}
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
          {(slide.columns || []).slice(0, 4).map((c, i) => (
            <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.11)", borderTop: `4px solid ${a}`, borderRadius: 14, padding: "26px 22px" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.034, marginBottom: 14, lineHeight: 1.15 }}>{txt(c.title)}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.026, color: "#aeb8c6", lineHeight: 1.4 }}>{txt(c.desc)}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "statGrid") {
    const st = (slide.stats || []).slice(0, 4);
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "grid", gridTemplateColumns: st.length <= 2 ? "1fr" : "1fr 1fr", gap: 22 }}>
          {st.map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 14, padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.09, color: a, lineHeight: 1, letterSpacing: -1 }}>{txt(s.value)}</div>
              <div style={{ marginTop: 12, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.026, color: "#c7cfda", lineHeight: 1.3 }}>{txt(s.label)}</div>
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
          <div style={{ display: "flex", gap: 8, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.11)", alignItems: "center" }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f56" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#27c93f" }} />
            {slide.lang ? <span style={{ marginLeft: 10, fontFamily: MONO, fontSize: width * 0.022, color: "#5b6b7c" }}>{txt(slide.lang)}</span> : null}
          </div>
          <div style={{ padding: "24px 26px", fontFamily: MONO, fontSize: width * 0.027, lineHeight: 1.65, color: "#d7dde5" }}>
            {(slide.lines || []).slice(0, 12).map((l, i) => (
              <div key={i} style={{ whiteSpace: "pre-wrap" }}><span style={{ color: "#3a4453", marginRight: 16 }}>{String(i + 1).padStart(2, "0")}</span>{txt(l)}</div>
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
          {(slide.items || []).map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: width * 0.026, background: it.ok ? "#16c78422" : "#ea394322", color: it.ok ? "#16c784" : "#ea3943", border: `1.5px solid ${it.ok ? "#16c784" : "#ea3943"}` }}>{it.ok ? "✓" : "✕"}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.032, lineHeight: 1.35, color: "#eef2f7", marginTop: 3 }}>{txt(it.text)}</div>
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
            {(slide.headers || []).map((h, i) => (
              <div key={i} style={{ flex: 1, padding: "18px 22px", fontFamily: MONO, fontWeight: 800, fontSize: width * 0.026, color: i === 1 ? a : "#c7cfda", letterSpacing: 1 }}>{txt(h)}</div>
            ))}
          </div>
          {(slide.rows || []).slice(0, 6).map((r, ri) => (
            <div key={ri} style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.10)", background: ri % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
              {(Array.isArray(r) ? r : [r]).map((c, ci) => (
                <div key={ci} style={{ flex: 1, padding: "18px 22px", fontFamily: DISPLAY, fontWeight: ci === 0 ? 600 : 500, fontSize: width * 0.026, color: ci === 1 ? "#eef2f7" : "#aeb8c6", lineHeight: 1.3 }}>{txt(c)}</div>
              ))}
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (slide.type === "metricBars") {
    const bars = (slide.bars || []).map((b) => ({ label: b.label, value: num(b.value) }));
    const max = Math.max(...bars.map((b) => b.value), 1);
    return (
      <Frame meta={meta} page={page} total={total}>
        {slide.title ? titleEl(slide.title, width) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {bars.slice(0, 5).map((b, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontFamily: DISPLAY, fontWeight: 600, fontSize: width * 0.03 }}>
                <span>{txt(b.label)}</span><span style={{ color: a, fontFamily: MONO }}>{b.value}</span>
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
            <span style={{ color: a, fontSize: width * 0.09, lineHeight: 0.5 }}>“</span>{txt(slide.text)}”
          </div>
          <div style={{ marginTop: 28, fontFamily: MONO, fontSize: width * 0.026, color: a, fontWeight: 700 }}>— {txt(slide.author)}{slide.role ? <span style={{ color: "#7c8a9c" }}>, {txt(slide.role)}</span> : null}</div>
        </div>
      </Frame>
    );
  }

  // cta
  return (
    <Frame meta={meta} page={page} total={total}>
      <div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.06, lineHeight: 1.1, letterSpacing: -0.8 }}>{txt(slide.title)}</div>
        {slide.sub ? <div style={{ marginTop: 24, fontFamily: DISPLAY, fontWeight: 500, fontSize: width * 0.034, color: "#aeb8c6" }}>{txt(slide.sub)}</div> : null}
        <div style={{ marginTop: 44, display: "inline-block", padding: "20px 44px", borderRadius: 999, background: a, color: "#05080d", fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.032 }}>
          + Follow {meta.brand}
        </div>
      </div>
    </Frame>
  );
};
