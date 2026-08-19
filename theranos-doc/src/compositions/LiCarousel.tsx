import React from "react";
import { useCurrentFrame } from "remotion";
import liData from "../data/li_carousel.json";
import { LiSlideView, LiSlide } from "../components/LiSlides";

/**
 * LinkedIn diagram carousel — one code-drawn slide per frame (render with `--sequence`).
 * 4:5 (1080x1350) — max feed real estate for a document/carousel post.
 */
export const LiCarousel: React.FC = () => {
  const frame = useCurrentFrame();
  const data = liData as unknown as { brand: string; handle?: string; accent: string; bg?: [string, string, string]; angle?: number; slides: LiSlide[] };
  const slides = data.slides || [];
  const i = Math.min(frame, slides.length - 1);
  const slide = slides[i] || { type: "cover", title: data.brand };
  const meta = { brand: data.brand, handle: data.handle, accent: data.accent || "#4f8cff", bg: data.bg, angle: data.angle };
  return <LiSlideView slide={slide as LiSlide} meta={meta} page={i + 1} total={slides.length} />;
};
