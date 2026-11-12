import { FONTS } from "./fonts";

export type Theme = {
  id: string;
  dark: boolean;
  bg: string;       // base
  bg2: string;      // depth / gradient partner
  ink: string;      // primary text
  dim: string;      // secondary text
  accent: string;   // hero color (highlights, active caption word, bars)
  accent2: string;  // secondary accent (glows, second series)
  onAccent: string; // text sitting on an accent block
  display: string;  // headline font
  displayWeight: number;
  displayUpper: boolean;
  body: string;     // UI / caption font
  mono: string;     // terminals + code
};

const base = { body: FONTS.body, mono: FONTS.mono };

export const THEMES: Record<string, Theme> = {
  /** Cohort Zero — premium black + deep crimson. Executive, never cute, never pink. */
  crimson: { id: "crimson", dark: true, bg: "#060606", bg2: "#1C0408", ink: "#F4F4F5", dim: "#8E8E95", accent: "#C8102E", accent2: "#E7E5E4", onAccent: "#FFFFFF", display: FONTS.grotesk, displayWeight: 700, displayUpper: false, ...base },
  /** Acid lime on black — the loud tech-edit look. */
  acid: { id: "acid", dark: true, bg: "#0B0B0B", bg2: "#141809", ink: "#F5F5F0", dim: "#8C8F80", accent: "#C6FF00", accent2: "#00E0FF", onAccent: "#0B0B0B", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
  /** Electric blue — clean futurist. */
  electric: { id: "electric", dark: true, bg: "#04060E", bg2: "#0B1636", ink: "#F2F5FF", dim: "#7F8AB0", accent: "#3D7BFF", accent2: "#7CF7FF", onAccent: "#FFFFFF", display: FONTS.grotesk, displayWeight: 700, displayUpper: false, ...base },
  /** Paper — light mode, editorial, orange punch (great for contrast in a dark feed). */
  paper: { id: "paper", dark: false, bg: "#F3EFE6", bg2: "#E6DECD", ink: "#0D0D0D", dim: "#6B6457", accent: "#FF4D00", accent2: "#0D0D0D", onAccent: "#FFFFFF", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
  /** Taxi — black + yellow, maximum stop-power. */
  taxi: { id: "taxi", dark: true, bg: "#000000", bg2: "#171300", ink: "#FFFFFF", dim: "#8A8A8A", accent: "#FFD400", accent2: "#FFFFFF", onAccent: "#000000", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
};

export const getTheme = (id: string): Theme => THEMES[id] || THEMES.crimson;

/** Hex → rgba helper for glows/tints. */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
