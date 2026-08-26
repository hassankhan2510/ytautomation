import React from "react";
import { Composition } from "remotion";
import { WhiteboardVideo, type WBData } from "./WhiteboardVideo";
import data from "./data/scenes.json";

export const RemotionRoot: React.FC = () => {
  const d = data as WBData;
  return (
    <Composition
      id="Whiteboard"
      component={WhiteboardVideo}
      durationInFrames={Math.max(30, d.totalDurationInFrames || 300)}
      fps={d.fps || 30}
      width={d.width || 1920}
      height={d.height || 1080}
      defaultProps={{ data: d }}
    />
  );
};
