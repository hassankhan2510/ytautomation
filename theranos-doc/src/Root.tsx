import React from "react";
import { Composition } from "remotion";
import { DocVideo } from "./compositions/DocVideo";
import timeline from "./data/timeline.json";

const fps = timeline.fps;
const durationInFrames = timeline.totalDurationInFrames;
const accent = timeline.accentColor || "#e11d48";

/**
 * One composition per platform aspect ratio. All read the SAME timeline + audio,
 * so you author once and render whichever format you need:
 *   YouTube  -> 16:9   |   Shorts/Reels/TikTok -> 9:16   |   Feed -> 1:1
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="YouTube"
        component={DocVideo}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{ accent }}
      />
      <Composition
        id="Shorts"
        component={DocVideo}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={{ accent }}
      />
      <Composition
        id="Square"
        component={DocVideo}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1080}
        defaultProps={{ accent }}
      />
    </>
  );
};
