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
  surface: string;  // card / panel background (solid on dark themes, translucent glass on vivid ones)
  bgGradient?: string; // rich multi-stop background (vivid themes) — replaces the flat bg radial
  vivid?: boolean;  // bright, saturated look: lighter vignette/grain, no light leak
  display: string;  // headline font
  displayWeight: number;
  displayUpper: boolean;
  body: string;     // UI / caption font
  mono: string;     // terminals + code
};

const base = { body: FONTS.body, mono: FONTS.mono };

export const THEMES: Record<string, Theme> = {
  /** Cohort Zero — premium black + deep crimson. Executive, never cute, never pink. */
  crimson: { id: "crimson", surface: "#141417", dark: true, bg: "#060606", bg2: "#1C0408", ink: "#F4F4F5", dim: "#8E8E95", accent: "#C8102E", accent2: "#E7E5E4", onAccent: "#FFFFFF", display: FONTS.grotesk, displayWeight: 700, displayUpper: false, ...base },
  /** Acid lime on black — the loud tech-edit look. */
  acid: { id: "acid", surface: "#141414", dark: true, bg: "#0B0B0B", bg2: "#141809", ink: "#F5F5F0", dim: "#8C8F80", accent: "#C6FF00", accent2: "#00E0FF", onAccent: "#0B0B0B", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
  /** Electric blue — clean futurist. */
  electric: { id: "electric", surface: "#0E1426", dark: true, bg: "#04060E", bg2: "#0B1636", ink: "#F2F5FF", dim: "#7F8AB0", accent: "#3D7BFF", accent2: "#7CF7FF", onAccent: "#FFFFFF", display: FONTS.grotesk, displayWeight: 700, displayUpper: false, ...base },
  /** Paper — light mode, editorial, orange punch (great for contrast in a dark feed). */
  paper: { id: "paper", surface: "#FFFFFF", dark: false, bg: "#F3EFE6", bg2: "#E6DECD", ink: "#0D0D0D", dim: "#6B6457", accent: "#FF4D00", accent2: "#0D0D0D", onAccent: "#FFFFFF", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
  /** Taxi — black + yellow, maximum stop-power. */
  taxi: { id: "taxi", surface: "#141414", dark: true, bg: "#000000", bg2: "#171300", ink: "#FFFFFF", dim: "#8A8A8A", accent: "#FFD400", accent2: "#FFFFFF", onAccent: "#000000", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
  /* ───── VIVID themes — rich, bright, saturated (new channels). Cards become glass over the gradient. ───── */
  /** Ocean — electric blue gradient, sunny-yellow punch. Clean, optimistic tech/science. */
  ocean: { id: "ocean", vivid: true, dark: true, bg: "#0A5CFF", bg2: "#00B4FF", bgGradient: "linear-gradient(165deg, #0038E0 0%, #0A6CFF 45%, #00C6FF 100%)", surface: "rgba(255,255,255,0.15)", ink: "#FFFFFF", dim: "#D3E6FF", accent: "#FFE14D", accent2: "#FF7A59", onAccent: "#0A1F44", display: FONTS.grotesk, displayWeight: 700, displayUpper: false, ...base },
  /** Grape — violet → magenta gradient, gold + cyan. Loud, Gen-Z, culture/history drops. */
  grape: { id: "grape", vivid: true, dark: true, bg: "#6A12E8", bg2: "#C2189E", bgGradient: "linear-gradient(160deg, #4A0BD6 0%, #8E17E0 50%, #D61C8E 100%)", surface: "rgba(255,255,255,0.14)", ink: "#FFFFFF", dim: "#EBDCFF", accent: "#FFD60A", accent2: "#4CF0E0", onAccent: "#2A0A5E", display: FONTS.wide, displayWeight: 900, displayUpper: true, ...base },
  /** Sunrise — orange → coral → violet. Warm, cinematic, storytelling. */
  sunrise: { id: "sunrise", vivid: true, dark: true, bg: "#FF6A3D", bg2: "#7B2FF7", bgGradient: "linear-gradient(170deg, #FFA23C 0%, #FF5E62 48%, #7B2FF7 100%)", surface: "rgba(255,255,255,0.16)", ink: "#FFFFFF", dim: "#FFE7D9", accent: "#FFF35C", accent2: "#3DF5FF", onAccent: "#3A0F2E", display: FONTS.grotesk, displayWeight: 700, displayUpper: false, ...base },
  /** Lagoon — deep teal → aqua, golden accent. Calm, smart, nature/science/research. */
  lagoon: { id: "lagoon", vivid: true, dark: true, bg: "#007C80", bg2: "#00B3A4", bgGradient: "linear-gradient(165deg, #005F73 0%, #0A9396 50%, #12C2B0 100%)", surface: "rgba(255,255,255,0.15)", ink: "#FFFFFF", dim: "#CFF5EF", accent: "#FFD166", accent2: "#FF7B54", onAccent: "#043B40", display: FONTS.grotesk, displayWeight: 700, displayUpper: false, ...base },
  /** Mango — juicy orange gradient, ink-black type, navy punch. Bright facts, food, money. */
  mango: { id: "mango", vivid: true, dark: false, bg: "#FF9F1C", bg2: "#FF6B1A", bgGradient: "linear-gradient(160deg, #FFC300 0%, #FF9500 55%, #FF5F1F 100%)", surface: "rgba(255,255,255,0.80)", ink: "#160C00", dim: "#5A3611", accent: "#13205B", accent2: "#FFFFFF", onAccent: "#FFFFFF", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
  /** Mint — fresh light mint, coral + emerald. Friendly explainers, health, how-things-work. */
  mint: { id: "mint", vivid: true, dark: false, bg: "#C9F7E6", bg2: "#8EE8CC", bgGradient: "linear-gradient(160deg, #E3FFF5 0%, #B5F2DD 55%, #7FE3C4 100%)", surface: "rgba(255,255,255,0.80)", ink: "#062B24", dim: "#2E6B5E", accent: "#FF5A36", accent2: "#00A36C", onAccent: "#FFFFFF", display: FONTS.wide, displayWeight: 900, displayUpper: false, ...base },
  /** Neon — acid lime gradient, black type, violet punch. Maximum stop-power, tech & trends. */
  neon: { id: "neon", vivid: true, dark: false, bg: "#C8FF3D", bg2: "#7CFF6B", bgGradient: "linear-gradient(160deg, #E4FF5C 0%, #B6FF3B 50%, #6CFF8A 100%)", surface: "rgba(255,255,255,0.82)", ink: "#0B0B0B", dim: "#3A4A12", accent: "#5B2BFF", accent2: "#0B0B0B", onAccent: "#FFFFFF", display: FONTS.condensed, displayWeight: 400, displayUpper: true, ...base },
};

export const getTheme = (id: string): Theme => THEMES[id] || THEMES.crimson;

/** Hex → rgba helper for glows/tints. */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
