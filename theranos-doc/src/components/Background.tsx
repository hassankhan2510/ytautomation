import React from "react";
import {
  AbsoluteFill,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

// Loop background clips every 8s. Safe for every current asset and typical stock
// footage; OffthreadVideo (used for reliable rendering) has no `loop` prop in 4.0.x.
const VIDEO_LOOP_FRAMES = 240;

export type BgSegment = {
  asset: string;
  type: "image" | "video";
  from: number;
  durationInFrames: number;
};

/**
 * Slow "Ken Burns" pan/zoom for a still image, driven by the segment's own length
 * so the motion always finishes exactly when the segment ends.
 */
const KenBurns: React.FC<{ src: string; durationInFrames: number; seed: number }> = ({
  src,
  durationInFrames,
  seed,
}) => {
  const frame = useCurrentFrame();
  const dir = seed % 2 === 0 ? 1 : -1; // alternate pan direction per segment
  const scale = interpolate(frame, [0, durationInFrames], [1.08, 1.22], {
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(frame, [0, durationInFrames], [0, dir * 40], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, durationInFrames], [0, -25], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

const BASE_OPACITY = 0.5; // backgrounds sit under the captions
const FADE_IN = 9; // scene fade-in frames
const OVERLAP = 12; // frames each scene lingers into the next -> cross-dissolve

/** Fades a scene in at its start and out into the next scene, for a smooth cross-dissolve. */
const FadeLayer: React.FC<{ dur: number; overlap: number; children: React.ReactNode }> = ({
  dur,
  overlap,
  children,
}) => {
  const frame = useCurrentFrame();
  const fin = interpolate(frame, [0, FADE_IN], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fout =
    overlap > 0
      ? interpolate(frame, [dur, dur + overlap], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;
  return <AbsoluteFill style={{ opacity: BASE_OPACITY * fin * fout }}>{children}</AbsoluteFill>;
};

/**
 * Renders one continuous background per group of consecutive same-asset lines. Each scene pans
 * (Ken Burns) and cross-dissolves into the next instead of hard-cutting.
 */
export const Background: React.FC<{ segments: BgSegment[] }> = ({ segments }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {segments.map((seg, i) => {
        const src = staticFile(`assets/${seg.asset}`);
        const overlap = i === segments.length - 1 ? 0 : OVERLAP; // don't extend past the end
        return (
          <Sequence key={i} from={seg.from} durationInFrames={seg.durationInFrames + overlap}>
            <FadeLayer dur={seg.durationInFrames} overlap={overlap}>
              {seg.type === "video" ? (
                <Loop durationInFrames={VIDEO_LOOP_FRAMES}>
                  <OffthreadVideo
                    src={src}
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </Loop>
              ) : (
                <KenBurns src={src} durationInFrames={seg.durationInFrames} seed={i} />
              )}
            </FadeLayer>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
