import React from "react";
import { Composition } from "remotion";
import { DocVideo } from "./compositions/DocVideo";
import { Carousel } from "./compositions/Carousel";
import { LiCarousel } from "./compositions/LiCarousel";
import { OnePager } from "./compositions/OnePager";
import { Thumbnail } from "./compositions/Thumbnail";
import timeline from "./data/timeline.json";
import carousel from "./data/carousel.json";
import liCarousel from "./data/li_carousel.json";

const fps = timeline.fps;
const durationInFrames = timeline.totalDurationInFrames;
const accent = timeline.accentColor || "#e11d48";
const carouselSlides = Math.max(1, (carousel as { slides?: unknown[] }).slides?.length ?? 1);

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
      {/* LinkedIn / Instagram carousel — one frame per slide (render with --sequence). */}
      <Composition
        id="Carousel"
        component={Carousel}
        durationInFrames={carouselSlides}
        fps={fps}
        width={1080}
        height={1080}
      />
      {/* LinkedIn diagram carousel — one code-drawn slide per frame, 4:5. */}
      <Composition
        id="LiCarousel"
        component={LiCarousel}
        durationInFrames={Math.max(1, (liCarousel as { slides?: unknown[] }).slides?.length ?? 1)}
        fps={fps}
        width={1080}
        height={1350}
      />
      {/* One-page vertical REEL (9:16) — a single animated LinkedIn-creator-style card. Content is
          passed via --props (see gen_onepager.mjs); ~8s at 30fps. */}
      <Composition
        id="OnePager"
        component={OnePager}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          brand: "COHORT ZERO",
          name: "Cohort Zero",
          at: "@cohortzero",
          accent: "#e11d48",
          kicker: "FOUNDER PLAYBOOK",
          headline: "The one slide VCs actually read first.",
          subline: "It isn't your team, your market, or your traction. It's this.",
          footer: "COHORT ZERO",
          cta: "follow →",
        }}
      />
      {/* YouTube thumbnail — 1280x720, rendered as a single still. */}
      <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={fps} width={1280} height={720} />
    </>
  );
};
