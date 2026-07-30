import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import timeline from "../data/timeline.json";
import { Background, BgSegment } from "../components/Background";
import { Caption, Word, Layout } from "../components/Caption";
import { Stat, Quote, Bullets } from "../components/SceneBlocks";
import { Grain } from "../components/Grain";

type TimelineLine = {
  index: number;
  startFrame: number;
  durationInFrames: number;
  audio: string;
  text: string;
  asset: string | null;
  type: "image" | "video";
  layout?: Layout | "stat" | "quote" | "bullets";
  kicker?: string | null;
  stat?: string | null;
  cite?: string | null;
  items?: string[] | null;
  words: Word[];
};

/** Group consecutive lines that share the same asset into one background segment. */
function buildSegments(lines: TimelineLine[]): BgSegment[] {
  const segments: BgSegment[] = [];
  for (const line of lines) {
    if (!line.asset) continue;
    const last = segments[segments.length - 1];
    if (last && last.asset === line.asset) {
      last.durationInFrames += line.durationInFrames;
    } else {
      segments.push({
        asset: line.asset,
        type: line.type,
        from: line.startFrame,
        durationInFrames: line.durationInFrames,
      });
    }
  }
  return segments;
}

export const DocVideo: React.FC<{ accent: string }> = ({ accent }) => {
  const { width, height } = useVideoConfig();
  const lines = timeline.lines as TimelineLine[];
  const segments = buildSegments(lines);

  const portrait = height > width;
  // Scale caption text to the frame so it reads well on both long-form and vertical.
  const fontSize = portrait ? Math.round(width * 0.052) : Math.round(width * 0.029);
  const maxWidth = portrait ? width * 0.86 : width * 0.68;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {/* Continuous background layer */}
      <Background segments={segments} />

      {/* Per-line narration + caption */}
      {lines.map((line) => (
        <Sequence
          key={line.index}
          from={line.startFrame}
          durationInFrames={line.durationInFrames}
        >
          <Audio src={staticFile(line.audio)} />
          {line.layout === "stat" ? (
            <Stat
              stat={line.stat || line.text}
              label={line.text}
              accent={accent}
              fontSize={fontSize}
              portrait={portrait}
            />
          ) : line.layout === "quote" ? (
            <Quote
              text={line.text}
              cite={line.cite}
              accent={accent}
              fontSize={fontSize}
              portrait={portrait}
            />
          ) : line.layout === "bullets" ? (
            <Bullets
              heading={line.kicker}
              items={line.items || []}
              accent={accent}
              fontSize={fontSize}
              portrait={portrait}
            />
          ) : (
            <Caption
              words={line.words}
              fallbackText={line.text}
              kicker={line.kicker}
              layout={line.layout as Layout}
              accent={accent}
              fontSize={fontSize}
              maxWidth={maxWidth}
              portrait={portrait}
            />
          )}
        </Sequence>
      ))}

      {/* Cinematic film grain */}
      <Grain />

      {/* Cinematic vignette */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 400px rgba(0,0,0,0.92)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
