import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { Reel, type ReelProps } from "./compositions/Reel";
import { buildTimeline } from "./engine/timeline";
import type { Job } from "./engine/types";
import hero from "./data/job.json";

const FPS = 30;

const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const fps = props.job.fps || FPS;
  const t = buildTimeline(props.job, fps);
  return { durationInFrames: Math.max(fps, t.totalFrames), fps };
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="Reel"
      component={Reel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 30}
      defaultProps={{ job: hero as unknown as Job, shaders: true }}
      calculateMetadata={calculateMetadata}
    />
  </>
);
