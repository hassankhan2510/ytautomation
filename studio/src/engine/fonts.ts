import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadUnbounded } from "@remotion/google-fonts/Unbounded";

/**
 * Fonts are loaded once at module scope (Remotion waits for them before rendering a frame).
 * Only the weights we actually use are requested — keeps CI renders fast.
 */
const condensed = loadAnton("normal", { weights: ["400"], subsets: ["latin"] });
const body = loadInterTight("normal", { weights: ["500", "700", "800", "900"], subsets: ["latin"] });
const grotesk = loadSpaceGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] });
const mono = loadJetBrains("normal", { weights: ["400", "700"], subsets: ["latin"] });
const wide = loadUnbounded("normal", { weights: ["700", "900"], subsets: ["latin"] });

export const FONTS = {
  /** Anton — tall condensed meme-edit headline. */
  condensed: condensed.fontFamily,
  /** Inter Tight — captions + UI. */
  body: body.fontFamily,
  /** Space Grotesk — premium tech headline (Cohort Zero). */
  grotesk: grotesk.fontFamily,
  /** JetBrains Mono — terminals, code, data. */
  mono: mono.fontFamily,
  /** Unbounded — wide, futuristic display (stamps, counters). */
  wide: wide.fontFamily,
} as const;
