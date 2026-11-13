import React, { useMemo } from "react";
import { AbsoluteFill, Audio, isHtmlInCanvasSupported, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { buildTimeline } from "../engine/timeline";
import { getTheme } from "../engine/theme";
import { makeRng } from "../engine/rng";
import { RenderProvider } from "../engine/render-context";
import { pickTransition, TRANSITIONS } from "../engine/transitions";
import { Backdrop, BACKDROPS, CameraRig, Grain, LightLeak, ProgressBar, Vignette } from "../engine/fx";
import { resolvePrimitive } from "../engine/registry";
import { BgMedia } from "../engine/bgmedia";
import { Captions } from "./Captions";
import { SoundLayer, useDuckedVolume } from "./Sound";
import type { Job, TimedBeat } from "../engine/types";
import "../engine/fonts";

export type ReelProps = { job: Job; shaders?: boolean };

/** Detect the GPU shader path at runtime (HTML-in-Canvas). Any failure → CSS path. */
const detectShaders = (wanted: boolean): boolean => {
  if (!wanted) return false;
  try {
    return Boolean(isHtmlInCanvasSupported());
  } catch {
    return false;
  }
};

const BeatScene: React.FC<{ beat: TimedBeat; seed: number; backdrop: (typeof BACKDROPS)[number] }> = ({ beat, seed, backdrop }) => {
  const rng = useMemo(() => makeRng(seed * 7919 + beat.index * 104729), [seed, beat.index]);
  const { Component } = resolvePrimitive(beat.primitive);
  const content = (
    <CameraRig beat={beat} rng={makeRng(seed + beat.index)}>
      <Component beat={beat} rng={rng} />
    </CameraRig>
  );
  return (
    <AbsoluteFill>
      {beat.bgSrc ? <BgMedia beat={beat} seed={seed} /> : <Backdrop kind={backdrop} seed={seed + beat.index} />}
      {beat.blur ? <CameraMotionBlur samples={6} shutterAngle={200}>{content}</CameraMotionBlur> : content}
    </AbsoluteFill>
  );
};

/**
 * THE REEL. Beat sheet in → finished edit out.
 *   backdrop + camera rig + primitive per beat, joined by energy-matched transitions;
 *   global layers on top: karaoke captions, retention bar, light leak, grain, vignette, audio.
 * Sync trick: each sequence lasts beat.frames + T (T = the outgoing transition), so the overlap is
 * eaten by the transition and every beat's content still starts exactly on its first spoken word.
 */
export const Reel: React.FC<ReelProps> = ({ job, shaders = false }) => {
  const { fps, width, height } = useVideoConfig();
  const timeline = useMemo(() => buildTimeline(job, fps), [job, fps]);
  const theme = getTheme(job.theme);
  const useShaders = useMemo(() => detectShaders(shaders), [shaders]);

  const plan = useMemo(() => {
    const rng = makeRng(job.seed);
    let prevT: string | null = null;
    let prevB: string | null = null;
    // Shader cuts (only when the render enables them) go on high-energy cuts, capped by job.shaderCuts.
    let budget = job.shaderCuts ?? 99;
    return timeline.beats.map((b, i) => {
      const isLast = i === timeline.beats.length - 1;
      const eligible = useShaders && budget > 0 && (b.energy === 3 || Boolean(b.transition));
      const t = isLast ? null : pickTransition(b, { width, height, rng, shaders: eligible, shaderChance: budget >= 99 ? 0.5 : 0.75 }, prevT);
      if (t && TRANSITIONS[t.name]?.shader) budget--;
      if (t) prevT = t.name;
      const pool = BACKDROPS.filter((k) => k !== prevB);
      const backdrop = (b.props?.backdrop as (typeof BACKDROPS)[number]) && BACKDROPS.includes(b.props?.backdrop as never) ? (b.props!.backdrop as (typeof BACKDROPS)[number]) : rng.pick(pool);
      prevB = backdrop;
      return { beat: b, t, backdrop };
    });
  }, [timeline, job.seed, width, height, useShaders]);

  const voiced = Boolean(job.audio);
  const musicVolume = useDuckedVolume(timeline, voiced);
  const cuts = useMemo(
    () => plan.flatMap((p, i) => (p.t && plan[i + 1] ? [{ into: plan[i + 1].beat, name: p.t.name, frames: p.t.frames }] : [])),
    [plan],
  );

  return (
    <RenderProvider value={{ theme, seed: job.seed, shaders: useShaders, timeline, handle: job.handle, logo: job.logo }}>
      <AbsoluteFill style={{ background: theme.bg }}>
        <TransitionSeries>
          {plan.flatMap(({ beat, t, backdrop }) => {
            const nodes = [
              <TransitionSeries.Sequence key={`s${beat.index}`} durationInFrames={beat.frames + (t ? t.frames : 0)}>
                <BeatScene beat={beat} seed={job.seed} backdrop={backdrop} />
              </TransitionSeries.Sequence>,
            ];
            if (t) {
              nodes.push(<TransitionSeries.Transition key={`t${beat.index}`} presentation={t.presentation} timing={linearTiming({ durationInFrames: t.frames })} />);
            }
            return nodes;
          })}
        </TransitionSeries>
        <Captions />
        <LightLeak seed={job.seed} />
        <Grain opacity={theme.vivid ? 0.05 : theme.dark ? 0.09 : 0.06} />
        <Vignette strength={theme.vivid ? 0.18 : theme.dark ? 0.55 : 0.25} />
        <ProgressBar />
        {job.audio ? <Audio src={staticFile(job.audio)} /> : null}
        {job.music ? <Audio src={staticFile(job.music)} volume={musicVolume} loop /> : null}
        {job.sfx !== false ? <SoundLayer timeline={timeline} cuts={cuts} voiced={voiced} /> : null}
      </AbsoluteFill>
    </RenderProvider>
  );
};
