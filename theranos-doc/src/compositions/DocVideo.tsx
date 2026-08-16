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
import { Chart, Compare, Timeline, Meter, NameTag, MapLocator, Collage, CountUp } from "../components/DataBlocks";
import { CandleChart, Candle, Overlay, Level } from "../components/CandleChart";
import { Grain } from "../components/Grain";
import { Intro, Outro } from "../components/Brand";

type TimelineLine = {
  index: number;
  startFrame: number;
  durationInFrames: number;
  audio: string;
  text: string;
  asset: string | null;
  type: "image" | "video";
  layout?: string;
  kicker?: string | null;
  words: Word[];
  // Optional block payloads
  stat?: string | null;
  cite?: string | null;
  items?: string[] | null;
  chart?: { label: string; value: number }[] | null;
  compare?: { left: { title: string; items: string[] }; right: { title: string; items: string[] } } | null;
  events?: { label: string; text: string }[] | null;
  percent?: number | null;
  value?: number | null;
  prefix?: string | null;
  suffix?: string | null;
  name?: string | null;
  role?: string | null;
  location?: string | null;
  coords?: string | null;
  collageAssets?: string[] | null;
  // candlestick chart (daily market-analysis reels)
  candles?: Candle[] | null;
  overlays?: Overlay[] | null;
  levels?: Level[] | null;
  timeframe?: string | null;
  pair?: string | null;
  assetName?: string | null;
  priceNow?: number | null;
  changePct?: number | null;
  decimals?: number | null;
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
  const fontSize = portrait ? Math.round(width * 0.052) : Math.round(width * 0.029);
  const maxWidth = portrait ? width * 0.86 : width * 0.68;

  const music = (timeline as { music?: string | null }).music;
  const musicVolume = (timeline as { musicVolume?: number }).musicVolume ?? 0.14;

  // Branding + SFX wiring.
  const tl = timeline as unknown as {
    introFrames?: number;
    outroFrames?: number;
    contentDurationInFrames?: number;
    totalDurationInFrames: number;
    brand?: string;
    tagline?: string;
  };
  const introFrames = tl.introFrames ?? 0;
  const outroFrames = tl.outroFrames ?? 0;
  const contentFrames = tl.contentDurationInFrames ?? tl.totalDurationInFrames - introFrames - outroFrames;
  const brand = tl.brand || "";
  const tagline = tl.tagline || "";
  const outroFrom = introFrames + contentFrames;

  const renderScene = (line: TimelineLine) => {
    const common = { accent, fontSize, portrait };
    switch (line.layout) {
      case "stat":
        return <Stat stat={line.stat || line.text} label={line.text} {...common} />;
      case "quote":
        return <Quote text={line.text} cite={line.cite} {...common} />;
      case "bullets":
        return <Bullets heading={line.kicker} items={line.items || []} {...common} />;
      case "chart":
        return <Chart data={line.chart || []} title={line.kicker || line.text} {...common} />;
      case "compare":
        return line.compare ? <Compare left={line.compare.left} right={line.compare.right} {...common} /> : null;
      case "timeline":
        return <Timeline events={line.events || []} {...common} />;
      case "meter":
        return <Meter percent={line.percent ?? 0} label={line.kicker || line.text} {...common} />;
      case "countup":
        return <CountUp value={line.value ?? 0} prefix={line.prefix} suffix={line.suffix} label={line.text} {...common} />;
      case "nametag":
        return <NameTag name={line.name || line.text} role={line.role} {...common} />;
      case "map":
        return <MapLocator location={line.location || line.text} coords={line.coords} {...common} />;
      case "collage":
        return <Collage assets={line.collageAssets || []} accent={accent} />;
      case "candles":
        return line.candles && line.candles.length ? (
          <CandleChart
            candles={line.candles}
            overlays={line.overlays || []}
            levels={line.levels || []}
            name={line.assetName || line.text}
            pair={line.pair || ""}
            timeframe={line.timeframe || ""}
            price={line.priceNow ?? line.candles[line.candles.length - 1].c}
            changePct={line.changePct ?? 0}
            decimals={line.decimals ?? 2}
            {...common}
          />
        ) : null;
      default:
        return (
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
        );
    }
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {/* Optional low-volume background music bed under the whole video (incl. intro/outro) */}
      {music ? <Audio src={staticFile(music)} volume={musicVolume} loop /> : null}

      {/* Intro logo sting (long-form only; skipped on shorts so it never blunts the hook) */}
      {introFrames > 0 ? (
        <Sequence from={0} durationInFrames={introFrames}>
          <Intro brand={brand} tagline={tagline} accent={accent} />
        </Sequence>
      ) : null}

      {/* Main content, offset to start after the intro */}
      <Sequence from={introFrames} durationInFrames={contentFrames}>
        {/* Continuous background layer */}
        <Background segments={segments} />

        {/* Per-line narration + scene */}
        {lines.map((line) => (
          <Sequence key={line.index} from={line.startFrame} durationInFrames={line.durationInFrames}>
            <Audio src={staticFile(line.audio)} />
            {renderScene(line)}
          </Sequence>
        ))}
      </Sequence>

      {/* Outro end-card */}
      {outroFrames > 0 ? (
        <Sequence from={outroFrom} durationInFrames={outroFrames}>
          <Outro brand={brand} tagline={tagline} accent={accent} />
        </Sequence>
      ) : null}

      {/* Cinematic film grain over everything */}
      <Grain />
    </AbsoluteFill>
  );
};
