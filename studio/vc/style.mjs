// STYLES: a style is data — which real font file, weight, size, tracking, line height and colour each
// role gets. The compiler measures with the SAME font files the renderer draws with (exact widths).
import { fileURLToPath } from "node:url";
import { loadFont } from "./font.mjs";

const F = (name) => fileURLToPath(new URL(`./fonts/${name}.ttf`, import.meta.url));

// size = fraction of the reference length (min(safe width, 0.8 x safe height)); floor = smallest readable px
export const STYLES = {
  "cohort-zero": {
    colors: { bg: "#060606", bg2: "#1C0408", ink: "#F4F4F5", dim: "#A1A1AA", accent: "#C8102E", accentHi: "#FF2A44", glow: "#C8102E" },
    roles: {
      kicker: { font: "InterTight-800", family: "Inter Tight", weight: 800, size: 0.046, tracking: 0.16, lh: 1.1, maxLines: 1, upper: true, color: "accent", floor: 26 },
      title: { font: "SpaceGrotesk-700", family: "Space Grotesk", weight: 700, size: 0.15, tracking: -0.025, lh: 1.0, maxLines: 3, color: "ink", floor: 54 },
      body: { font: "InterTight-500", family: "Inter Tight", weight: 500, size: 0.064, tracking: 0, lh: 1.24, maxLines: 4, color: "dim", floor: 34 },
      stat: { font: "Unbounded-900", family: "Unbounded", weight: 900, size: 0.27, tracking: -0.04, lh: 1.0, maxLines: 1, color: "accent", floor: 110 },
      label: { font: "InterTight-700", family: "Inter Tight", weight: 700, size: 0.058, tracking: 0, lh: 1.15, maxLines: 2, color: "ink", floor: 32 },
      item: { font: "SpaceGrotesk-700", family: "Space Grotesk", weight: 700, size: 0.085, tracking: -0.015, lh: 1.08, maxLines: 2, color: "ink", floor: 38 },
      quote: { font: "SpaceGrotesk-700", family: "Space Grotesk", weight: 700, size: 0.09, tracking: -0.02, lh: 1.12, maxLines: 4, color: "ink", floor: 40 },
      by: { font: "InterTight-700", family: "Inter Tight", weight: 700, size: 0.04, tracking: 0.12, lh: 1.2, maxLines: 1, upper: true, color: "accent", floor: 24 },
    },
  },
};

export function getStyle(name) {
  const st = STYLES[name] || STYLES["cohort-zero"];
  for (const r of Object.values(st.roles)) if (!r.metrics) r.metrics = loadFont(F(r.font));
  return st;
}
export const fontFiles = () => [...new Set(Object.values(STYLES).flatMap((s) => Object.values(s.roles).map((r) => r.font)))];
