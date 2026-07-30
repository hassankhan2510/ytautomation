import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* Shared helpers ---------------------------------------------------------- */

function useFade() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inO = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const outO = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return frame > durationInFrames - 12 ? outO : inO;
}

/** A soft dark scrim so text-heavy blocks read over any background. */
const Scrim: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.55)" }} />
);

const sans = 'system-ui, "Segoe UI", Roboto, sans-serif';

/* ============================ CHART (bars) ============================ */
export const Chart: React.FC<{
  data: { label: string; value: number }[];
  title?: string | null;
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ data, title, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFade();
  const max = Math.max(...data.map((d) => d.value), 1);
  const barH = portrait ? 520 : 440;

  return (
    <AbsoluteFill>
      <Scrim />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
        {title ? (
          <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 1.1), fontWeight: 800, color: "#f8fafc", marginBottom: 40 }}>
            {title}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "flex-end", gap: portrait ? 28 : 48, height: barH }}>
          {data.map((d, i) => {
            const grow = spring({ frame: frame - i * 4, fps, config: { mass: 0.5, damping: 14 } });
            const h = (d.value / max) * barH * grow;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: barH }}>
                <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.8), fontWeight: 700, color: "#f8fafc", marginBottom: 12 }}>
                  {d.value.toLocaleString()}
                </div>
                <div
                  style={{
                    width: portrait ? 110 : 130,
                    height: Math.max(h, 2),
                    background: `linear-gradient(180deg, ${accent} 0%, ${accent}88 100%)`,
                    borderRadius: "8px 8px 0 0",
                    boxShadow: `0 0 30px ${accent}55`,
                  }}
                />
                <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.62), fontWeight: 500, color: "rgba(248,250,252,0.7)", marginTop: 14 }}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============================ COMPARE (VS) ============================ */
type ComparePanel = { title: string; items: string[] };
export const Compare: React.FC<{
  left: ComparePanel;
  right: ComparePanel;
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ left, right, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFade();
  const slide = spring({ frame, fps, config: { mass: 0.5, damping: 15 } });

  const panel = (p: ComparePanel, side: "left" | "right", color: string) => (
    <div
      style={{
        flex: 1,
        padding: portrait ? "40px 40px" : "50px 60px",
        background: "linear-gradient(135deg, rgba(20,20,20,0.85), rgba(5,5,5,0.92))",
        border: "1px solid rgba(255,255,255,0.08)",
        borderTop: `5px solid ${color}`,
        borderRadius: 16,
        transform: `translateX(${(1 - slide) * (side === "left" ? -60 : 60)}px)`,
      }}
    >
      <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 1.05), fontWeight: 800, color, marginBottom: 26 }}>
        {p.title}
      </div>
      {p.items.map((it, i) => (
        <div key={i} style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.8), fontWeight: 500, color: "#f8fafc", marginBottom: 16, lineHeight: 1.35 }}>
          • {it}
        </div>
      ))}
    </div>
  );

  return (
    <AbsoluteFill>
      <Scrim />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: portrait ? "0 60px" : "0 140px", opacity }}>
        <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: 40, width: "100%", alignItems: "stretch", position: "relative" }}>
          {panel(left, "left", "#94a3b8")}
          {panel(right, "right", accent)}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 84,
              height: 84,
              borderRadius: "50%",
              background: accent,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: sans,
              fontWeight: 900,
              fontSize: 34,
              boxShadow: `0 0 40px ${accent}`,
            }}
          >
            VS
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============================ TIMELINE ============================ */
export const Timeline: React.FC<{
  events: { label: string; text: string }[];
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ events, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = useFade();
  const per = (durationInFrames * 0.65) / Math.max(events.length, 1);

  return (
    <AbsoluteFill>
      <Scrim />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: portrait ? "flex-start" : "center", padding: portrait ? "0 70px" : "0 160px", opacity }}>
        <div style={{ position: "relative", paddingLeft: 40 }}>
          <div style={{ position: "absolute", left: 8, top: 6, bottom: 6, width: 3, background: `${accent}66` }} />
          {events.map((e, i) => {
            const s = spring({ frame: frame - i * per, fps, config: { mass: 0.5, damping: 15 } });
            const o = interpolate(frame - i * per, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ display: "flex", gap: 26, marginBottom: portrait ? 34 : 40, opacity: o, transform: `translateX(${(1 - s) * -30}px)` }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ position: "absolute", left: -40, top: 6, width: 20, height: 20, borderRadius: "50%", background: accent, boxShadow: `0 0 18px ${accent}` }} />
                </div>
                <div>
                  <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.95), fontWeight: 800, color: accent }}>{e.label}</div>
                  <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.78), fontWeight: 500, color: "#f8fafc", marginTop: 4, maxWidth: 1100 }}>{e.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============================ METER (radial %) ============================ */
export const Meter: React.FC<{
  percent: number;
  label: string;
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ percent, label, accent, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFade();
  const anim = spring({ frame, fps, config: { mass: 0.6, damping: 16 } });
  const shown = Math.round(percent * anim);
  const R = 180;
  const C = 2 * Math.PI * R;
  const off = C * (1 - (percent * anim) / 100);

  return (
    <AbsoluteFill>
      <Scrim />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
        <div style={{ position: "relative", width: 440, height: 440, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={440} height={440} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
            <circle cx={220} cy={220} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={22} />
            <circle cx={220} cy={220} r={R} fill="none" stroke={accent} strokeWidth={22} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ filter: `drop-shadow(0 0 12px ${accent})` }} />
          </svg>
          <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 2.4), fontWeight: 800, color: "#f8fafc" }}>{shown}%</div>
        </div>
        <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.95), fontWeight: 500, color: "rgba(248,250,252,0.85)", marginTop: 24 }}>{label}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============================ NAME TAG ============================ */
export const NameTag: React.FC<{
  name: string;
  role?: string | null;
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ name, role, accent, fontSize, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFade();
  const slide = spring({ frame, fps, config: { mass: 0.5, damping: 14, stiffness: 140 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: portrait ? "0 0 200px 60px" : "0 0 150px 150px" }}>
      <div style={{ opacity, transform: `translateX(${(1 - slide) * -300}px)`, display: "flex", alignItems: "stretch" }}>
        <div style={{ width: 10, background: accent, boxShadow: `0 0 24px ${accent}`, borderRadius: 4, marginRight: 26 }} />
        <div style={{ background: "linear-gradient(135deg, rgba(20,20,20,0.9), rgba(5,5,5,0.96))", padding: "26px 46px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 1.5), fontWeight: 800, color: "#f8fafc", letterSpacing: "-1px" }}>{name}</div>
          {role ? <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.72), fontWeight: 600, color: accent, letterSpacing: "1px", textTransform: "uppercase", marginTop: 6 }}>{role}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ============================ MAP / LOCATOR ============================ */
export const MapLocator: React.FC<{
  location: string;
  coords?: string | null;
  accent: string;
  fontSize: number;
  portrait: boolean;
}> = ({ location, coords, accent, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFade();
  const pop = spring({ frame, fps, config: { mass: 0.5, damping: 12 } });
  const ring = (frame % 60) / 60; // pulsing ring 0..1

  return (
    <AbsoluteFill>
      <Scrim />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
        <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", width: 160 * ring, height: 160 * ring, borderRadius: "50%", border: `2px solid ${accent}`, opacity: 1 - ring }} />
          <div style={{ width: 34, height: 34, borderRadius: "50% 50% 50% 0", background: accent, transform: `rotate(-45deg) scale(${pop})`, boxShadow: `0 0 30px ${accent}` }} />
        </div>
        <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 1.3), fontWeight: 800, color: "#f8fafc", marginTop: 20 }}>{location}</div>
        {coords ? <div style={{ fontFamily: sans, fontSize: Math.round(fontSize * 0.7), fontWeight: 600, color: accent, letterSpacing: "2px", marginTop: 8 }}>{coords}</div> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============================ COLLAGE ============================ */
export const Collage: React.FC<{
  assets: string[];
  accent: string;
}> = ({ assets, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFade();
  const cols = assets.length <= 2 ? assets.length : 2;
  const rows = Math.ceil(assets.length / cols);

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#000" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 6, width: "100%", height: "100%" }}>
        {assets.map((a, i) => {
          const s = spring({ frame: frame - i * 3, fps, config: { mass: 0.5, damping: 16 } });
          return (
            <div key={i} style={{ overflow: "hidden", position: "relative" }}>
              <Img src={staticFile(`assets/${a}`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${interpolate(s, [0, 1], [1.15, 1])})` }} />
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ boxShadow: `inset 0 0 300px rgba(0,0,0,0.7)`, border: `4px solid ${accent}`, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
