/**
 * The BEAT SHEET — the only thing the AI writes. It never writes rendering code; it picks primitives
 * from a typed menu and fills their props. That's why every job renders: the LLM can't break React.
 */

/** A spoken word with real timing (seconds), from whisper on the narration. Optional. */
export type Word = { w: string; start: number; end: number };

export type Energy = 1 | 2 | 3;

export type Beat = {
  /** What is SAID during this beat (narration). Drives timing + captions. */
  text: string;
  /** Optional voice-only version of the line (e.g. Urdu script) when the screen shows a different
   *  spelling (Roman Urdu). narrate.py reads this; captions/scenes use `text`. */
  speak?: string;
  /** Primitive id from the registry (e.g. "stomp", "terminal", "notifs"). */
  primitive: string;
  /** Primitive-specific props (see each primitive's `props` doc in the registry). */
  props?: Record<string, unknown>;
  /** Words to punch: accent color, camera shake, highlight. Auto-detects numbers if omitted. */
  emphasis?: string[];
  /** 1 calm · 2 normal · 3 hype. Drives punch strength, transition choice, shake. */
  energy?: Energy;
  /** Force a transition INTO the next beat (otherwise chosen by energy + seed). */
  transition?: string;
  /** Extra seconds to linger after the words end. */
  hold?: number;
  /** Real motion blur for this beat (expensive on CPU — use on the 1-2 most kinetic beats). */
  blur?: boolean;
  /** Background search query for this beat (stock footage/photo), written by the AI director. */
  bg?: string;
  /** Resolved background file under public/ (set by scripts/props.mjs) and its kind. */
  bgSrc?: string;
  bgKind?: "video" | "image";
};

export type Job = {
  id: string;
  title?: string;
  /** Theme id ("crimson", "acid", "electric", "paper", "taxi"). */
  theme: string;
  /** Variation seed — same job + new seed = a visibly different edit. */
  seed: number;
  fps?: number;
  /** Narration file under public/ (e.g. "audio/voice.wav"). Optional. */
  audio?: string;
  /** Music bed under public/ — mixed low under the voice. Optional. */
  music?: string;
  /** Word timings for `audio`. If absent, timing is estimated from the text. */
  words?: Word[];
  /** Cap on real GPU shader cuts when the render enables shaders (slow on CPU runners). Default: no cap. */
  shaderCuts?: number;
  /** Sound effects on cuts / key words / end card (default on). */
  sfx?: boolean;
  /** Which TTS engine voiced this job (set by scripts/narrate.py). */
  voice?: string;
  /** Brand mark under public/ (e.g. "brand/cohortzero-mark.png") — used by the end card avatar. */
  logo?: string;
  /** On-screen handle for end card / chrome (e.g. "@cohort_zero"). */
  handle?: string;
  beats: Beat[];
};

/** A word placed on the timeline (absolute frames). */
export type TimedWord = { w: string; from: number; to: number; emphasis: boolean; beat: number };

/** A beat placed on the timeline (absolute frames). */
export type TimedBeat = Beat & {
  index: number;
  from: number;
  frames: number;
  words: TimedWord[];
  energy: Energy;
};

export type Timeline = { beats: TimedBeat[]; words: TimedWord[]; totalFrames: number; fps: number };
