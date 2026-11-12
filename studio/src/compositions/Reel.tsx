import React, { useMemo } from "react";
import { AbsoluteFill, Audio, isHtmlInCanvasSupported, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { buildTimeline } from "../engine/timeline";
import { getTheme } from "../engine/theme";
import { makeRng } from "../engine/rng";
import { RenderProvider } from "../engine/render-context";
import { pickTransition } from "../engine/transitions";
import { Backdrop, BACKDROPS, CameraRig, Grain, LightLeak, ProgressBar, Vignette } from "../engine/fx";
import { resolvePrimitive } from "../engine/registry";
import { Captions } from "./Captions";
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
      <Backdrop kind={backdrop} seed={seed + beat.index} />
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
export const Reel: React.FC<ReelProps> = ({ job, shaders = true }) => {
  const { fps, width, height } = useVideoConfig();
  const timeline = useMemo(() => buildTimeline(job, fps), [job, fps]);
  const theme = getTheme(job.theme);
  const useShaders = useMemo(() => detectShaders(shaders), [shaders]);

  const plan = useMemo(() => {
    const rng = makeRng(job.seed);
    let prevT: string | null = null;
    let prevB: string | null = null;
    return timeline.beats.map((b, i) => {
      const isLast = i === timeline.beats.length - 1;
      const t = isLast ? null : pickTransition(b, { width, height, rng, shaders: useShaders }, prevT);
      if (t) prevT = t.name;
      const pool = BACKDROPS.filter((k) => k !== prevB);
      const backdrop = (b.props?.backdrop as (typeof BACKDROPS)[number]) && BACKDROPS.includes(b.props?.backdrop as never) ? (b.props!.backdrop as (typeof BACKDROPS)[number]) : rng.pick(pool);
      prevB = backdrop;
      return { beat: b, t, backdrop };
    });
  }, [timeline, job.seed, width, height, useShaders]);

  return (
    <RenderProvider value={{ theme, seed: job.seed, shaders: useShaders, timeline, handle: job.handle }}>
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
        <Grain opacity={theme.dark ? 0.09 : 0.06} />
        <Vignette strength={theme.dark ? 0.55 : 0.25} />
        <ProgressBar />
        {job.audio ? <Audio src={staticFile(job.audio)} /> : null}
        {job.music ? <Audio src={staticFile(job.music)} volume={job.audio ? 0.12 : 0.5} loop /> : null}
      </AbsoluteFill>
    </RenderProvider>
  );
};
