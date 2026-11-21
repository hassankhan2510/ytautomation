import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { Reel, type ReelProps } from "./compositions/Reel";
import { buildTimeline } from "./engine/timeline";
import type { Job } from "./engine/types";
import hero from "./data/job.json";
import { CueReel, type CueProps } from "./cue/CueReel";

const FPS = 30;

const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const fps = props.job.fps || FPS;
  const t = buildTimeline(props.job, fps);
  return { durationInFrames: Math.max(fps, t.totalFrames), fps };
};

const cueMetadata: CalculateMetadataFunction<CueProps> = ({ props }) => {
  const fps = props.plan.fps || FPS;
  const A = props.plan.aspects[props.aspect] || Object.values(props.plan.aspects)[0];
  return { durationInFrames: Math.max(fps, Math.ceil(props.plan.duration * fps)), fps, width: A?.canvas.w || 1080, height: A?.canvas.h || 1920 };
};
const EMPTY_PLAN = { duration: 1, fps: FPS, style: "cohort-zero", colors: {}, aspects: { "9:16": { canvas: { w: 1080, h: 1920 }, scenes: [{ id: "empty", start: 0, end: 1, camera: { from: 1, to: 1 }, units: [] }] } } };

export const Root: React.FC = () => (
  <>
    <Composition
      id="Cue"
      component={CueReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS}
      defaultProps={{ plan: EMPTY_PLAN, aspect: "9:16", captions: true } as CueProps}
      calculateMetadata={cueMetadata}
    />
    <Composition
      id="Reel"
      component={Reel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 30}
      defaultProps={{ job: hero as unknown as Job, shaders: false }}
      calculateMetadata={calculateMetadata}
    />
  </>
);
