import React, { useMemo } from "react";
import { Audio, Sequence, staticFile } from "remotion";
import type { Timeline, TimedBeat } from "../engine/types";

type Cut = { into: TimedBeat; name: string; frames: number };

const sfx = (name: string) => staticFile(`sfx/${name}.wav`);

/** Which effect a transition gets — the sound matches what the eye sees. */
const CUT_SFX: Record<string, string> = {
  zoomPunch: "whoosh", echoZoom: "whoosh", spinZoom: "whoosh", flash: "whoosh", zoomBlur: "whoosh", crossZoom: "whoosh",
  whip: "swoosh", slide: "swoosh", wipe: "swoosh", pushCut: "swoosh", cube: "swoosh", swap: "swoosh", blurSlide: "swoosh", crosswarp: "swoosh",
  glitch: "glitch", burn: "whoosh", filmBurn: "whoosh",
};

/**
 * SOUND DESIGN — whooshes on cuts, an impact when a hype beat lands, a pop on each beat's key word,
 * a riser into the first cut (hook tension) and a ding on the end card. Mixed quieter under a voice.
 */
export const SoundLayer: React.FC<{ timeline: Timeline; cuts: Cut[]; voiced: boolean }> = ({ timeline, cuts, voiced }) => {
  const g = voiced ? 1 : 1.3;
  const events = useMemo(() => {
    const ev: { at: number; name: string; vol: number }[] = [];
    const fps = timeline.fps;
    // Riser into the first cut, if the hook is long enough to build under.
    const first = cuts[0];
    if (first && first.into.from > fps * 1.6) ev.push({ at: Math.max(0, first.into.from - Math.round(1.3 * fps)), name: "riser", vol: 0.24 });
    for (const c of cuts) {
      const s = CUT_SFX[c.name];
      if (s) ev.push({ at: Math.max(0, c.into.from - 4), name: s, vol: s === "glitch" ? 0.22 : 0.3 });
      if (c.into.energy === 3) ev.push({ at: c.into.from + Math.round(c.frames * 0.6), name: "impact", vol: 0.34 });
    }
    // One pop per beat, on its first emphasis word (energy >= 2 only — calm beats stay clean).
    for (const b of timeline.beats) {
      if (b.energy < 2 || b.primitive === "outro") continue;
      const w = b.words.find((x) => x.emphasis);
      if (w) ev.push({ at: w.from, name: "pop", vol: 0.2 });
    }
    const outro = timeline.beats.find((b) => b.primitive === "outro");
    if (outro) ev.push({ at: outro.from + Math.round(0.75 * fps), name: "ding", vol: 0.26 });
    return ev.sort((a, b) => a.at - b.at);
  }, [timeline, cuts]);
  return (
    <>
      {events.map((e, i) => (
        <Sequence key={i} from={e.at} durationInFrames={Math.round(timeline.fps * 1.6)} layout="none">
          <Audio src={sfx(e.name)} volume={Math.min(1, e.vol * g)} />
        </Sequence>
      ))}
    </>
  );
};

/**
 * MUSIC DUCKING — per-frame music volume: dips while the narrator speaks, swells back in pauses.
 * Smoothed (moving average) so it breathes instead of pumping.
 */
export function useDuckedVolume(timeline: Timeline, voiced: boolean) {
  return useMemo(() => {
    const n = Math.max(1, timeline.totalFrames + 2);
    if (!voiced) return () => 0.42;
    const speaking = new Float32Array(n);
    for (const w of timeline.words) for (let f = Math.max(0, w.from - 3); f < Math.min(n, w.to + 5); f++) speaking[f] = 1;
    const win = 9;
    const smooth = new Float32Array(n);
    let acc = 0;
    for (let f = 0; f < n; f++) {
      acc += speaking[f] - (f - win >= 0 ? speaking[f - win] : 0);
      smooth[f] = acc / win;
    }
    return (f: number) => 0.2 - 0.11 * smooth[Math.min(n - 1, Math.max(0, Math.round(f)))];
  }, [timeline, voiced]);
}
