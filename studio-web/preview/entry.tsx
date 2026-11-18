// Live preview of the REAL studio composition in the browser (same React code the render server uses).
// Exposes window.StudioPreview.mount(el, props, assetMap) -> { update(props, assetMap?), seek(frame), unmount() }
import React from "react";
import { createRoot } from "react-dom/client";
import { Player, PlayerRef } from "@remotion/player";
import { Reel } from "../../studio/src/compositions/Reel";
import { buildTimeline } from "../../studio/src/engine/timeline";
import { setAssetMap } from "../../studio/src/engine/asset";
import { REGISTRY } from "../../studio/src/engine/registry";

type Props = { job: any; shaders?: boolean };
const FPS = 30;

function Preview({ props, playerRef }: { props: Props; playerRef: React.RefObject<PlayerRef | null> }) {
  const fps = props.job.fps || FPS;
  const total = Math.max(fps, buildTimeline(props.job, fps).totalFrames);
  return (
    <Player
      ref={playerRef}
      component={Reel as any}
      inputProps={{ ...props, shaders: false }}
      durationInFrames={total}
      compositionWidth={1080}
      compositionHeight={1920}
      fps={fps}
      controls
      clickToPlay
      acknowledgeRemotionLicense
      style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: 12, overflow: "hidden", background: "#000" }}
    />
  );
}

(window as any).StudioPreview = {
  // the scene library (id, category, description, props doc) for the editor's "change the look" picker
  primitives() { return Object.values(REGISTRY).map((e) => e.meta); },
  mount(el: HTMLElement, props: Props, assetMap: Record<string, string> = {}) {
    setAssetMap(assetMap);
    const root = createRoot(el);
    const ref = React.createRef<PlayerRef>();
    let cur = props;
    const draw = () => root.render(<Preview props={cur} playerRef={ref} />);
    draw();
    return {
      update(next: Props, map?: Record<string, string>) {
        if (map) setAssetMap(map);
        cur = next;
        draw();
      },
      seek(frame: number) { ref.current?.seekTo(frame); },
      frameOfBeat(i: number) { return buildTimeline(cur.job, cur.job.fps || FPS).beats[i]?.from ?? 0; },
      duration() { return buildTimeline(cur.job, cur.job.fps || FPS).totalFrames / (cur.job.fps || FPS); },
      unmount() { root.unmount(); },
    };
  },
};
