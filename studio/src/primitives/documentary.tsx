/**
 * DOCUMENTARY family — history, facts and research, told the Gen-Z way (fast, tactile, cinematic).
 * Images come from `props.src` (uploaded) or `props.prompt` (free AI image fetched before render);
 * every primitive still looks finished with no image at all.
 * Perf rule (CPU runners): no full-screen blur / mix-blend-mode; colour filters only on the image layer.
 */
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useRender } from "../engine/render-context";
import { alpha } from "../engine/theme";
import { easeInOut, easeOut, fitSize, pop } from "../engine/motion";
import { hash01 } from "../engine/rng";
import { localWords, prop, Safe, type PrimitiveProps } from "./common";

const src = (p: string) => (/^https?:\/\//.test(p) ? p : staticFile(p));
const PAPER = "#EFE7D6";
const INK = "#1B1712";
const serif = "Georgia, 'Times New Roman', serif";

/** Old-film frame: sepia image, gate weave, flicker, scratches, dust. */
const FilmImage: React.FC<{ file: string; w: number; h: number; seed: number; tone?: "sepia" | "bw"; label?: string }> = ({ file, w, h, seed, tone = "sepia", label = "" }) => {
  const frame = useCurrentFrame();
  const weaveX = (hash01(frame, seed) - 0.5) * 4, weaveY = (hash01(frame, seed, 1) - 0.5) * 3;
  const flicker = 0.9 + hash01(frame, seed, 2) * 0.12;
  const scratches = [0, 1, 2].filter((k) => hash01(Math.floor(frame / 3), k, seed) > 0.55);
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#2A2420" }}>
      {file ? (
        <Img src={src(file)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${weaveX}px, ${weaveY}px) scale(${1.04 + frame * 0.0006})`, filter: `${tone === "bw" ? "grayscale(1)" : "sepia(0.85) saturate(0.9)"} contrast(1.12) brightness(${flicker})` }} />
      ) : (
        // No image → an intentional archival TITLE CARD (engraved border, ornaments, serif label), never an empty box.
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(70% 60% at 50% 40%, #5E4E3B, #231E1A)`, opacity: flicker, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: Math.min(w, h) * 0.06, border: "3px solid rgba(233,217,176,0.55)", outline: "1px solid rgba(233,217,176,0.3)", outlineOffset: -12 }} />
          <div style={{ textAlign: "center", color: "#E9D9B0", fontFamily: serif, padding: "0 12%" }}>
            <div style={{ fontSize: Math.min(w, h) * 0.05, letterSpacing: 10, opacity: 0.7 }}>✦ ✦ ✦</div>
            <div style={{ fontSize: Math.min(w, h) * (label.length > 14 ? 0.085 : 0.12), fontStyle: "italic", lineHeight: 1.1, margin: "18px 0" }}>{label || "Archive"}</div>
            <div style={{ fontSize: Math.min(w, h) * 0.04, letterSpacing: 8, opacity: 0.65 }}>— ARCHIVE —</div>
          </div>
        </div>
      )}
      {scratches.map((k) => <div key={k} style={{ position: "absolute", top: 0, bottom: 0, left: `${hash01(Math.floor(frame / 3), k, seed, 9) * 100}%`, width: 2, background: "rgba(255,250,235,0.55)" }} />)}
      {Array.from({ length: 5 }, (_, k) => <div key={`d${k}`} style={{ position: "absolute", left: `${hash01(frame, k, 3) * 100}%`, top: `${hash01(frame, k, 4) * 100}%`, width: 3 + hash01(frame, k) * 5, height: 3 + hash01(frame, k, 5) * 4, borderRadius: 4, background: hash01(k, frame) > 0.5 ? "rgba(0,0,0,0.7)" : "rgba(255,250,235,0.6)" }} />)}
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 120px rgba(0,0,0,0.75)" }} />
    </div>
  );
};

/* ─────────────────────────── ARCHIVE FILM ───────────────────────────
 * The image plays as an old film strip (sprocket holes, weave, scratches) with a stamped place/year. */
export const ArchiveFilm: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const file = prop<string>(beat, "src", "");
  const year = prop<string>(beat, "year", "");
  const place = prop<string>(beat, "place", "");
  const s = pop(frame, fps, 0, "smooth");
  const tag = pop(frame, fps, 8, "slam");
  const holes = (side: "left" | "right") => (
    <div style={{ position: "absolute", top: 0, bottom: 0, [side]: 0, width: 70, background: "#0B0A09", display: "flex", flexDirection: "column", justifyContent: "space-around", alignItems: "center", transform: `translateY(${(frame * 6) % 90 - 45}px)` } as React.CSSProperties}>
      {Array.from({ length: 16 }, (_, i) => <div key={i} style={{ width: 34, height: 46, borderRadius: 8, background: "#2B2722" }} />)}
    </div>
  );
  return (
    <Safe>
      <div style={{ position: "relative", padding: "0 70px", background: "#0B0A09", transform: `rotate(${(1 - s) * -6 - 1.5}deg) scale(${interpolate(s, [0, 1], [0.86, 1])})`, opacity: s, boxShadow: "0 40px 100px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        {holes("left")}{holes("right")}
        <div style={{ padding: "26px 0" }}><FilmImage file={file} w={780} h={940} seed={seed + beat.index} label={[place, year].filter(Boolean).join(", ") || beat.text.split(/\s+/).slice(0, 4).join(" ")} /></div>
      </div>
      {year || place ? (
        <div style={{ position: "absolute", left: 110, top: 300, transform: `rotate(-6deg) scale(${interpolate(tag, [0, 1], [2.2, 1])})`, opacity: Math.min(1, tag * 1.5), border: `6px solid ${theme.accent}`, color: theme.accent, background: alpha("#0B0A09", 0.75), padding: "8px 26px", fontFamily: theme.mono, fontWeight: 700, fontSize: 52, letterSpacing: 4 }}>
          {place ? `${place.toUpperCase()}${year ? " · " : ""}` : ""}{year}
        </div>
      ) : null}
    </Safe>
  );
};

/* ─────────────────────────── YEAR REWIND ───────────────────────────
 * Time travel: the year counter spins backwards (2026 → 1453) with motion-smeared digits and a
 * colour shift from modern to sepia as it falls. The history intro. */
export const YearRewind: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const from = prop(beat, "from", 2026);
  const to = prop(beat, "to", 1969);
  const label = prop<string>(beat, "label", "");
  const t = easeInOut(frame, 4, Math.max(18, beat.frames * 0.6));
  const year = Math.round(from + (to - from) * t);
  const speed = Math.abs(Math.sin(t * Math.PI));
  const land = frame >= 4 + beat.frames * 0.6 ? pop(frame, fps, Math.floor(4 + beat.frames * 0.6), "slam") : 0;
  const sep = t; // 0 modern → 1 sepia
  const bg = `rgba(${Math.round(20 + 70 * sep)}, ${Math.round(8 + 55 * sep)}, ${Math.round(10 + 30 * sep)}, ${0.35 * sep})`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: bg }} />
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: 200 + i * 110, height: 2, background: alpha(theme.ink, 0.08 * speed), transform: `translateX(${((frame * 40 + i * 300) % 2400) - 1200}px)` }} />
      ))}
      <Safe>
        <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 36, letterSpacing: 10, color: theme.accent, marginBottom: 20, opacity: 0.9 }}>{t < 1 ? "◀◀ REWINDING" : "ARRIVED"}</div>
        <div style={{ position: "relative", fontFamily: theme.display, fontWeight: 900, fontSize: 300, lineHeight: 1, letterSpacing: -10, color: sep > 0.6 ? "#F2E6CC" : theme.ink, transform: `scale(${1 + land * 0.06 - (land > 0 ? Math.sin(land * Math.PI) * 0.06 : 0)})` }}>
          <span style={{ position: "absolute", inset: 0, transform: `translateY(${speed * -40}px)`, opacity: speed * 0.25 }}>{Math.abs(year + 1)}</span>
          <span style={{ position: "absolute", inset: 0, transform: `translateY(${speed * 40}px)`, opacity: speed * 0.25 }}>{Math.abs(year - 1)}</span>
          {Math.abs(year)}
          {year < 0 ? <span style={{ fontSize: 110, letterSpacing: 0, marginLeft: 18, color: theme.accent }}>BC</span> : null}
        </div>
        {label ? <div style={{ marginTop: 30, fontFamily: serif, fontStyle: "italic", fontSize: 54, color: theme.ink, opacity: land }}>{label}</div> : null}
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── DECLASSIFIED ───────────────────────────
 * A typed government-style file; black redaction bars peel away to reveal the key line, then a
 * DECLASSIFIED stamp. History mysteries, hidden facts. */
export const Declassified: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const title = prop(beat, "title", "CASE FILE");
  const lines = prop<string[]>(beat, "lines", ["Subject: unknown", beat.text, "Status: buried for decades"]);
  const reveal = prop(beat, "reveal", 1);
  const stampAt = Math.floor(beat.frames * 0.62);
  const st = frame >= stampAt ? pop(frame, fps, stampAt, "slam") : 0;
  const card = pop(frame, fps, 0, "snap");
  return (
    <Safe>
      <div style={{ position: "relative", width: 900, padding: "56px 60px 70px", background: PAPER, color: INK, fontFamily: "'Courier New', monospace", transform: `rotate(-1.5deg) translateY(${(1 - card) * 200}px)`, opacity: card, boxShadow: "0 40px 90px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, fontWeight: 700, letterSpacing: 3, borderBottom: `3px solid ${INK}`, paddingBottom: 14, marginBottom: 30 }}>
          <span>{title}</span><span>REF-{String(1000 + beat.index * 137).slice(0, 4)}</span>
        </div>
        {lines.map((l, i) => {
          const isReveal = i === reveal;
          const peel = isReveal ? easeInOut(frame, Math.floor(beat.frames * 0.28), 12) : 0;
          return (
            <div key={i} style={{ position: "relative", fontSize: isReveal ? 46 : 36, fontWeight: 700, lineHeight: 1.35, marginBottom: 22, color: isReveal ? INK : alpha(INK, 0.75) }}>
              {l}
              {isReveal || i % 2 === 0 ? (
                <div style={{ position: "absolute", left: -6, right: isReveal ? `${peel * 100}%` : `${30 + hash01(i) * 30}%`, top: 4, bottom: 4, background: "#0A0A0A", display: isReveal || i !== 0 ? "block" : "none" }} />
              ) : null}
            </div>
          );
        })}
        {st > 0 ? <div style={{ position: "absolute", right: 30, bottom: -50, transform: `rotate(-12deg) scale(${interpolate(st, [0, 1], [2.6, 1])})`, opacity: Math.min(1, st * 1.6), border: `9px solid ${theme.accent}`, color: theme.accent, padding: "4px 26px", fontFamily: theme.display, fontWeight: 900, fontSize: 78, letterSpacing: 4, background: alpha(PAPER, 0.5) }}>DECLASSIFIED</div> : null}
      </div>
    </Safe>
  );
};

/* ─────────────────────────── RED STRING ───────────────────────────
 * Detective / conspiracy board: cards pinned on cork, red string pulls taut between them in order,
 * the final card circled. Connecting historical events, cause → effect. */
export const RedString: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const cards = prop<string[]>(beat, "cards", ["The spark", "The cover-up", "The leak", "The fallout"]);
  const n = Math.min(5, cards.length);
  const pos = Array.from({ length: n }, (_, i) => ({
    x: 140 + (i % 2) * 420 + hash01(i, seed) * 120,
    y: 300 + i * (1000 / Math.max(1, n - 1 || 1)) * 0.92 + hash01(i, seed, 1) * 40,
    r: (hash01(i, seed, 2) - 0.5) * 10,
  }));
  const step = Math.max(6, Math.floor((beat.frames * 0.7) / Math.max(1, n)));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "#3B2A1E", backgroundImage: `radial-gradient(${alpha("#000000", 0.25)} 2px, transparent 2.5px), radial-gradient(${alpha("#FFFFFF", 0.05)} 1px, transparent 1.5px)`, backgroundSize: "18px 18px, 11px 11px" }} />
      <AbsoluteFill style={{ boxShadow: "inset 0 0 220px rgba(0,0,0,0.75)" }} />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, zIndex: 3 }}>
        {pos.slice(1).map((p, i) => {
          const a = pos[i];
          const t = easeOut(frame, 4 + (i + 1) * step - 4, 8);
          const x1 = a.x + 170, y1 = a.y + 20, x2 = p.x + 170, y2 = p.y + 20;
          const sag = (1 - t) * 60 + 18;
          return <path key={i} d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag} ${x1 + (x2 - x1) * t} ${y1 + (y2 - y1) * t}`} stroke="#D7141E" strokeWidth={6} fill="none" strokeLinecap="round" />;
        })}
      </svg>
      {pos.map((p, i) => {
        const at = 2 + i * step;
        if (frame < at) return null;
        const s = pop(frame, fps, at, "slam");
        const last = i === n - 1;
        return (
          <div key={i} style={{ position: "absolute", left: p.x, top: p.y, width: 340, padding: "40px 26px 30px", background: i % 2 ? "#F3EEDD" : "#FFFFFF", color: INK, transform: `rotate(${p.r}deg) scale(${interpolate(s, [0, 1], [1.4, 1])})`, opacity: Math.min(1, s * 2), boxShadow: "0 18px 30px rgba(0,0,0,0.55)", fontFamily: theme.body, fontWeight: 900, fontSize: 44, lineHeight: 1.1, zIndex: 2 }}>
            <div style={{ position: "absolute", top: 8, left: 152, width: 34, height: 34, borderRadius: 17, background: "#D7141E", boxShadow: "0 4px 6px rgba(0,0,0,0.5)", zIndex: 4 }} />
            <div style={{ fontFamily: theme.mono, fontSize: 22, color: alpha(INK, 0.55), marginBottom: 8 }}>#{String(i + 1).padStart(2, "0")}</div>
            {cards[i]}
            {last ? <svg width={420} height={260} style={{ position: "absolute", left: -40, top: -40 }}><ellipse cx={210} cy={130} rx={200} ry={118} fill="none" stroke="#D7141E" strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - easeOut(frame, at + 8, 10)} /></svg> : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ─────────────────────────── RESEARCH PAPER ───────────────────────────
 * A journal page slides up; a highlighter sweeps the key finding; the citation pops as a tag.
 * Research facts with the SOURCE on screen (credibility is the brand). */
export const ResearchPaper: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const title = prop(beat, "title", "A study you should know about");
  const finding = prop(beat, "finding", beat.text);
  const citation = prop<string>(beat, "citation", "");
  const s = pop(frame, fps, 0, "smooth");
  const hl = easeInOut(frame, Math.floor(beat.frames * 0.3), 14);
  const tag = frame > beat.frames * 0.55 ? pop(frame, fps, Math.floor(beat.frames * 0.55), "snap") : 0;
  const filler = (w: number, k: number) => <div key={k} style={{ height: 14, width: `${w}%`, background: alpha(INK, 0.16), borderRadius: 7, marginBottom: 16 }} />;
  return (
    <Safe>
      <div style={{ position: "relative", width: 880, padding: "60px 64px 70px", background: "#FBFAF6", color: INK, transform: `perspective(1600px) rotateX(${(1 - s) * 25}deg) translateY(${(1 - s) * 260}px)`, opacity: s, boxShadow: "0 40px 100px rgba(0,0,0,0.55)" }}>
        <div style={{ fontFamily: theme.mono, fontSize: 22, letterSpacing: 3, color: alpha(INK, 0.55), marginBottom: 14 }}>RESEARCH ARTICLE</div>
        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 50, lineHeight: 1.15, marginBottom: 30 }}>{title}</div>
        {[96, 88, 92].map(filler)}
        <div style={{ position: "relative", fontFamily: serif, fontSize: 44, lineHeight: 1.35, margin: "18px 0 26px" }}>
          <span style={{ backgroundImage: `linear-gradient(${alpha(theme.accent, 0.45)}, ${alpha(theme.accent, 0.45)})`, backgroundRepeat: "no-repeat", backgroundSize: `${hl * 100}% 62%`, backgroundPosition: "0 85%", padding: "0 4px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" } as React.CSSProperties}>{finding}</span>
        </div>
        {[90, 94, 70].map(filler)}
      </div>
      {citation ? (
        <div style={{ marginTop: 34, padding: "14px 28px", borderRadius: 14, background: theme.accent, color: theme.onAccent, fontFamily: theme.mono, fontWeight: 700, fontSize: 32, transform: `scale(${tag})`, maxWidth: 900, textAlign: "center" }}>SOURCE · {citation}</div>
      ) : null}
    </Safe>
  );
};

/* ─────────────────────────── FACT CARD ───────────────────────────
 * "FACT #07" collectible card: big number tag, the fact in bold, a source line, holo sheen sweep. */
export const FactCard: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme } = useRender();
  const n = prop(beat, "n", beat.index + 1);
  const fact = prop(beat, "fact", beat.text);
  const source = prop<string>(beat, "source", "");
  const s = pop(frame, fps, 0, "slam");
  const sheen = interpolate(frame, [6, 26], [-60, 160], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Safe>
      <div style={{ position: "relative", width: 820, minHeight: 980, borderRadius: 44, padding: 60, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between", background: `linear-gradient(160deg, ${theme.bg2}, ${theme.bg} 60%)`, border: `4px solid ${alpha(theme.accent, 0.7)}`, boxShadow: `0 50px 120px rgba(0,0,0,0.6), inset 0 0 0 12px ${alpha(theme.ink, 0.04)}`, transform: `perspective(1600px) rotateY(${(1 - s) * -70}deg) scale(${interpolate(s, [0, 1], [0.8, 1])})` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 34, letterSpacing: 8, color: theme.accent }}>FACT</div>
          <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 120, lineHeight: 1, color: alpha(theme.ink, 0.12) }}>#{String(n).padStart(2, "0")}</div>
        </div>
        <div style={{ fontFamily: theme.body, fontWeight: 900, fontSize: fitSize(fact.split(/\s+/), 700 * 2.2, 78, 50, 0.55), lineHeight: 1.12, color: theme.ink }}>{fact}</div>
        <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.dim, borderTop: `2px solid ${alpha(theme.ink, 0.12)}`, paddingTop: 20, minHeight: 36 }}>{source ? `Source: ${source}` : ""}</div>
        <div style={{ position: "absolute", top: -200, bottom: -200, width: 220, left: `${sheen}%`, transform: "rotate(18deg)", background: `linear-gradient(90deg, transparent, ${alpha("#FFFFFF", 0.14)}, transparent)` }} />
      </div>
    </Safe>
  );
};

/* ─────────────────────────── SCALE COMPARE ───────────────────────────
 * Size comparison: circles for each item grow to true relative scale, camera zooms out to fit the
 * biggest — the "how big is it really" format. */
type Thing = { label: string; size: number };
export const ScaleCompare: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const items = prop<Thing[]>(beat, "items", [{ label: "Earth", size: 1 }, { label: "Neptune", size: 3.9 }, { label: "Jupiter", size: 11.2 }]);
  const unit = prop(beat, "unit", "×");
  const sorted = [...items].sort((a, b) => a.size - b.size);
  const n = sorted.length;
  const step = Math.max(8, (beat.frames * 0.75) / Math.max(1, n));
  const idx = Math.min(n - 1, Math.max(0, (frame - 4) / step));
  const k = Math.floor(idx), f = easeInOut(idx - k, 0, 1);
  const targetMax = sorted[Math.min(n - 1, k + (f > 0 ? 1 : 0))].size;
  const prevMax = sorted[k].size;
  const curMax = prevMax + (targetMax - prevMax) * f;
  const pxPerUnit = 640 / Math.max(0.0001, curMax); // largest visible = 640px diameter
  const baseY = 1240;
  let x = 0;
  const layout = sorted.map((it) => {
    const d = Math.max(6, it.size * pxPerUnit);
    const cx = x + d / 2;
    x += d + 30;
    return { ...it, d, cx };
  });
  const span = x - 30;
  const offset = 540 - Math.min(span, 1000) / 2 - Math.max(0, span - 1000);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 60, right: 60, top: baseY, height: 4, background: alpha(theme.ink, 0.25) }} />
      {layout.map((it, i) => {
        const shown = i <= k + (f > 0.05 ? 1 : 0);
        const o = shown ? 1 : 0;
        return (
          <div key={i} style={{ position: "absolute", left: offset + it.cx - it.d / 2, top: baseY - it.d, width: it.d, height: it.d, borderRadius: "50%", opacity: o, background: i === n - 1 ? `radial-gradient(circle at 35% 30%, ${theme.accent2}, ${theme.accent} 55%, ${theme.bg2})` : `radial-gradient(circle at 35% 30%, ${alpha(theme.ink, 0.9)}, ${alpha(theme.ink, 0.35)} 60%, ${alpha(theme.ink, 0.15)})` }}>
            {it.d > 60 ? <div style={{ position: "absolute", left: "50%", top: -76, transform: "translateX(-50%)", whiteSpace: "nowrap", fontFamily: theme.body, fontWeight: 900, fontSize: 40, color: theme.ink }}>{it.label}</div> : null}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, textAlign: "center", fontFamily: theme.display, fontWeight: 900, fontSize: 140, color: theme.accent }}>
        {(sorted[Math.min(n - 1, Math.round(idx))].size / sorted[0].size).toLocaleString("en-US", { maximumFractionDigits: 1 })}{unit}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── BOOK CHAPTER ───────────────────────────
 * A hardback opens in 3D; the page reveals "CHAPTER III" + title. Story structure for long explainers. */
export const BookChapter: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const chapter = prop(beat, "chapter", "I");
  const title = prop(beat, "title", beat.text);
  const open = easeInOut(frame, 4, 18);
  const text = easeOut(frame, 16, 12);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 260, perspective: 2200 }}>
      <div style={{ position: "relative", width: 760, height: 1000, transformStyle: "preserve-3d", transform: `rotateX(14deg) rotateZ(-3deg) translateX(${open * 150}px)` }}>
        <div style={{ position: "absolute", inset: 0, background: PAPER, borderRadius: "6px 18px 18px 6px", boxShadow: "inset 30px 0 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 70, textAlign: "center", color: INK }}>
          <div style={{ fontFamily: serif, fontSize: 40, letterSpacing: 14, opacity: text }}>CHAPTER</div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 200, lineHeight: 1, opacity: text, color: theme.accent }}>{chapter}</div>
          <div style={{ width: 160, height: 3, background: INK, margin: "26px 0", opacity: text }} />
          <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 62, lineHeight: 1.15, opacity: text, transform: `translateY(${(1 - text) * 20}px)` }}>{title}</div>
        </div>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "left center", transform: `rotateY(${-open * 165}deg)`, transformStyle: "preserve-3d" }}>
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: "6px 18px 18px 6px", background: `linear-gradient(135deg, ${theme.bg2}, #120607)`, border: `3px solid ${alpha(theme.accent, 0.6)}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 40px 90px rgba(0,0,0,0.6)" }}>
            <div style={{ border: `3px solid ${alpha("#E9D9B0", 0.7)}`, padding: "40px 50px", fontFamily: serif, color: "#E9D9B0", fontSize: 54, letterSpacing: 8, textAlign: "center" }}>{prop(beat, "cover", "THE STORY")}</div>
          </div>
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#E4DAC4", borderRadius: "18px 6px 6px 18px" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── LOCATE ───────────────────────────
 * Satellite-style zoom: coordinates tick in, concentric target rings tighten onto the place,
 * crosshair locks, label prints. "Where it happened". */
export const Locate: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, seed } = useRender();
  const place = prop(beat, "place", "Alexandria");
  const lat = prop(beat, "lat", 31.2);
  const lon = prop(beat, "lon", 29.9);
  const year = prop<string>(beat, "year", "");
  const t = easeInOut(frame, 2, Math.max(16, beat.frames * 0.55));
  const lock = frame > beat.frames * 0.55 ? pop(frame, fps, Math.floor(beat.frames * 0.55), "snap") : 0;
  const zoom = 1 + t * 5;
  const fmt = (v: number, p: string, q: string) => `${Math.abs(v * t + (1 - t) * (hash01(frame, seed) * 90)).toFixed(4)}°${v >= 0 ? p : q}`;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "50% 45%" }}>
        <AbsoluteFill style={{ backgroundImage: `linear-gradient(${alpha(theme.accent, 0.18)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.accent, 0.18)} 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />
        {Array.from({ length: 26 }, (_, i) => <div key={i} style={{ position: "absolute", left: `${hash01(i, seed) * 100}%`, top: `${hash01(i, seed, 1) * 100}%`, width: 30 + hash01(i, 2) * 160, height: 20 + hash01(i, 3) * 110, borderRadius: "40% 60% 55% 45%", background: alpha(theme.ink, 0.05 + hash01(i, 4) * 0.06) }} />)}
      </AbsoluteFill>
      {[3, 2, 1].map((r) => <div key={r} style={{ position: "absolute", left: 540 - r * 130 * (1.6 - t * 0.6), top: 864 - r * 130 * (1.6 - t * 0.6), width: r * 260 * (1.6 - t * 0.6), height: r * 260 * (1.6 - t * 0.6), borderRadius: "50%", border: `3px solid ${alpha(theme.accent, 0.25 + 0.2 * (3 - r))}` }} />)}
      <div style={{ position: "absolute", left: 540 - 2, top: 600, width: 4, height: 528, background: alpha(theme.accent, 0.5 + lock * 0.5) }} />
      <div style={{ position: "absolute", top: 864 - 2, left: 276, height: 4, width: 528, background: alpha(theme.accent, 0.5 + lock * 0.5) }} />
      <div style={{ position: "absolute", left: 540 - 22, top: 864 - 22, width: 44, height: 44, borderRadius: 22, background: theme.accent, transform: `scale(${0.5 + lock * 0.5 + Math.sin(frame / 4) * 0.08 * lock})`, boxShadow: `0 0 0 ${lock * 18}px ${alpha(theme.accent, 0.25)}` }} />
      <div style={{ position: "absolute", left: 80, top: 260, fontFamily: theme.mono, fontWeight: 700, fontSize: 34, color: theme.ink, lineHeight: 1.5 }}>
        <div style={{ color: theme.accent }}>{lock > 0.5 ? "● TARGET LOCKED" : "○ SCANNING…"}</div>
        <div>LAT {fmt(lat, "N", "S")}</div>
        <div>LON {fmt(lon, "E", "W")}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1000, textAlign: "center", opacity: lock }}>
        <div style={{ display: "inline-block", padding: "16px 36px", background: theme.ink, color: theme.bg, fontFamily: theme.display, fontWeight: 900, fontSize: 72, textTransform: "uppercase" }}>{place}</div>
        {year ? <div style={{ marginTop: 14, fontFamily: theme.mono, fontWeight: 700, fontSize: 40, color: theme.accent }}>{year}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── MUSEUM FRAME ───────────────────────────
 * Gallery wall: a gilded frame with spotlight pool holds the (AI/uploaded) portrait; a brass
 * placard slides up with name and dates. Historical figures. */
export const MuseumFrame: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { seed } = useRender();
  const file = prop<string>(beat, "src", "");
  const name = prop<string>(beat, "name", "");
  const dates = prop<string>(beat, "dates", "");
  const s = pop(frame, fps, 0, "smooth");
  const plaque = easeOut(frame, 12, 12);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(42% 30% at 50% 38%, rgba(255,230,190,0.16), transparent 70%), linear-gradient(#1A1412, #0C0A09)` }} />
      <Safe>
        <div style={{ padding: 34, background: "linear-gradient(135deg, #8A6A2F, #E8C877 30%, #7A5A22 55%, #D9B866 80%, #6E4F1D)", boxShadow: "0 50px 100px rgba(0,0,0,0.7), inset 0 0 0 6px rgba(0,0,0,0.25)", transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`, opacity: s }}>
          <div style={{ padding: 14, background: "#120E0B" }}>
            <FilmImage file={file} w={640} h={800} seed={seed + beat.index} tone="sepia" label={name || dates} />
          </div>
        </div>
        {name ? (
          <div style={{ marginTop: 40, padding: "18px 40px", background: "linear-gradient(#C9A75A, #9C7B35)", color: "#1E160B", textAlign: "center", boxShadow: "0 10px 20px rgba(0,0,0,0.5)", transform: `translateY(${(1 - plaque) * 40}px)`, opacity: plaque }}>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 52, letterSpacing: 2 }}>{name}</div>
            {dates ? <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 34 }}>{dates}</div> : null}
          </div>
        ) : null}
      </Safe>
    </AbsoluteFill>
  );
};

/* ─────────────────────────── TYPEWRITER ───────────────────────────
 * Old paper in a typewriter; the line types with key-strike jitter and a carriage-return slide.
 * Letters, quotes, historical documents. Words land in sync with the narration. */
export const Typewriter: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme } = useRender();
  const words = localWords(beat);
  const heading = prop<string>(beat, "heading", "");
  const shown = words.filter((w) => w.at <= frame + 1);
  const last = shown[shown.length - 1];
  const strike = last ? Math.max(0, 1 - (frame - last.at) / 4) : 0;
  return (
    <Safe>
      <div style={{ position: "relative", width: 880, minHeight: 860, padding: "70px 70px", background: PAPER, color: INK, boxShadow: "0 40px 90px rgba(0,0,0,0.55)", transform: `translateX(${-shown.length * 2}px) translateY(${strike * 3}px)`, backgroundImage: `repeating-linear-gradient(transparent 0 66px, ${alpha(INK, 0.06)} 66px 68px)` }}>
        {heading ? <div style={{ fontFamily: "'Courier New', monospace", fontSize: 30, letterSpacing: 4, color: alpha(INK, 0.6), marginBottom: 26 }}>{heading}</div> : null}
        <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, fontSize: 54, lineHeight: "68px" }}>
          {shown.map((w, i) => <span key={i} style={{ color: w.emphasis ? theme.accent : INK, opacity: 0.82 + hash01(i) * 0.18 }}>{w.w} </span>)}
          <span style={{ display: "inline-block", width: 28, height: 52, background: alpha(INK, Math.floor(frame / 8) % 2 ? 0 : 0.8), verticalAlign: "middle" }} />
        </div>
      </div>
    </Safe>
  );
};

/* ─────────────────────────── THEN / NOW ───────────────────────────
 * Split frame: THEN (sepia film) on top, NOW (modern, colour) below; a divider wipes to reveal NOW. */
export const ThenNow: React.FC<PrimitiveProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { theme, seed } = useRender();
  const then = prop<string>(beat, "src", "");
  const now = prop<string>(beat, "src2", "");
  const thenLabel = prop(beat, "then", "THEN");
  const nowLabel = prop(beat, "now", "NOW");
  const wipe = easeInOut(frame, Math.floor(beat.frames * 0.35), 14);
  const label = (t: string, at: number, dark: boolean): React.ReactNode => <div style={{ position: "absolute", left: 30, top: at, padding: "8px 22px", background: dark ? INK : theme.accent, color: dark ? PAPER : theme.onAccent, fontFamily: theme.mono, fontWeight: 700, fontSize: 36, letterSpacing: 3 }}>{t}</div>;
  return (
    <Safe>
      <div style={{ position: "relative", width: 860, height: 1100, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,0.6)" }}>
        <div style={{ position: "absolute", left: 0, top: 0 }}><FilmImage file={then} w={860} h={545} seed={seed + beat.index} label={thenLabel} /></div>
        {label(thenLabel, 24, true)}
        <div style={{ position: "absolute", left: 0, top: 555, width: 860, height: 545, background: theme.bg2, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }}>
          {now ? <Img src={src(now)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(70% 60% at 50% 40%, ${theme.accent}, ${theme.bg2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: theme.display, fontWeight: 900, fontSize: 130, color: theme.onAccent, letterSpacing: -2 }}>{nowLabel}</div>
            </div>
          )}
          {label(nowLabel, 24, false)}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 545, height: 10, background: theme.ink }} />
        <div style={{ position: "absolute", top: 555, height: 545, left: `${wipe * 100}%`, width: 6, marginLeft: -3, background: theme.accent, opacity: wipe < 1 ? 1 : 0 }} />
      </div>
    </Safe>
  );
};

