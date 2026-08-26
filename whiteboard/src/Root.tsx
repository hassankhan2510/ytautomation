import React from "react";
import { Composition } from "remotion";
import { WhiteboardVideo, ScenesDoc } from "./WhiteboardVideo";
import scenes from "./data/scenes.json";

const doc = scenes as ScenesDoc;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Whiteboard"
      component={WhiteboardVideo}
      durationInFrames={Math.max(60, doc.totalDurationInFrames || 720)}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ doc }}
    />
  );
};
