import type { Energy, Job, TimedBeat, TimedWord, Timeline } from "./types";

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%]/g, "");
export const tokenize = (text: string) => text.split(/\s+/).map((w) => w.trim()).filter(Boolean);

/** Numbers / money / percentages are always worth punching. */
const isAutoEmphasis = (w: string) => /\d/.test(w);

/**
 * Place every beat and every spoken word on the frame timeline.
 *  - With `job.words` (whisper timings on the real narration) beats snap to the actual speech, so
 *    every pop and shake lands exactly on the syllable.
 *  - Without it, timing is estimated from a fast Gen-Z read (~2.8 words/sec, faster on hype beats).
 * Beats are made contiguous (no gaps) so transitions can overlap cleanly.
 */
export function buildTimeline(job: Job, fps: number): Timeline {
  const beats = job.beats || [];
  const spoken = job.words && job.words.length ? job.words : null;
  const tokens = beats.map((b) => tokenize(b.text));
  const out: TimedBeat[] = [];
  const allWords: TimedWord[] = [];

  if (spoken) {
    // Walk the whisper words in order, giving each beat as many words as its text has.
    let wi = 0;
    const starts: number[] = [];
    const wordSlices: { w: string; start: number; end: number }[][] = [];
    for (const toks of tokens) {
      // A silent beat (e.g. the visual-only end card) consumes no spoken words; it starts just after
      // the previous beat's last word.
      const slice = spoken.slice(wi, wi + toks.length);
      wi += toks.length;
      wordSlices.push(slice);
      const prevSlice = wordSlices.length > 1 ? wordSlices[wordSlices.length - 2] : [];
      const prevEnd = prevSlice.length ? prevSlice[prevSlice.length - 1].end + 0.3 : starts.length ? starts[starts.length - 1] + 1 : 0;
      starts.push(slice.length ? slice[0].start : prevEnd);
    }
    const lastEnd = spoken[spoken.length - 1]?.end ?? 0;
    beats.forEach((b, i) => {
      const from = i === 0 ? 0 : Math.round(starts[i] * fps);
      const nextFrom = i < beats.length - 1 ? Math.round(starts[i + 1] * fps) : Math.round((lastEnd + 0.5 + (b.hold || 0)) * fps);
      const frames = Math.max(Math.round(0.6 * fps), nextFrom - from);
      const emph = new Set((b.emphasis || []).map(clean));
      const words: TimedWord[] = wordSlices[i].map((sw, k) => {
        const disp = tokens[i][k] ?? sw.w;
        return {
          w: disp,
          from: Math.round(sw.start * fps),
          to: Math.max(Math.round(sw.start * fps) + 2, Math.round(sw.end * fps)),
          emphasis: emph.size ? emph.has(clean(disp)) : isAutoEmphasis(disp),
          beat: i,
        };
      });
      out.push({ ...b, index: i, from, frames, words, energy: (b.energy || 2) as Energy });
      allWords.push(...words);
    });
  } else {
    let cursor = 0;
    beats.forEach((b, i) => {
      const energy = (b.energy || 2) as Energy;
      const wps = energy === 3 ? 3.2 : energy === 1 ? 2.4 : 2.8;
      const toks = tokens[i];
      const speechSec = Math.max(0.9, toks.length / wps);
      const frames = Math.round((speechSec + 0.22 + (b.hold || 0)) * fps);
      const emph = new Set((b.emphasis || []).map(clean));
      // Spread words across the speech window, weighted by length (long words take longer to say).
      const weights = toks.map((t) => 0.6 + Math.min(12, t.length) * 0.12);
      const total = weights.reduce((a, c) => a + c, 0) || 1;
      let t = cursor + 2;
      const speechFrames = speechSec * fps;
      const words: TimedWord[] = toks.map((w, k) => {
        const len = (weights[k] / total) * speechFrames;
        const tw: TimedWord = {
          w,
          from: Math.round(t),
          to: Math.round(t + len),
          emphasis: emph.size ? emph.has(clean(w)) : isAutoEmphasis(w),
          beat: i,
        };
        t += len;
        return tw;
      });
      out.push({ ...b, index: i, from: cursor, frames, words, energy });
      allWords.push(...words);
      cursor += frames;
    });
  }

  const last = out[out.length - 1];
  const totalFrames = last ? last.from + last.frames : fps;
  return { beats: out, words: allWords, totalFrames, fps };
}

/** Local (sequence-relative) frame for a timed word inside its beat. */
export const localFrom = (beat: TimedBeat, w: TimedWord) => w.from - beat.from;
