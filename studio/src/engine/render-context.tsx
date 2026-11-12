import { createContext, useContext } from "react";
import type { Theme } from "./theme";
import type { Timeline } from "./types";

/** Everything a primitive may need beyond its own beat — shared once instead of prop-drilled. */
export type RenderInfo = {
  theme: Theme;
  seed: number;
  /** GPU shader path (HTML-in-Canvas) is available in this renderer → use the real effects. */
  shaders: boolean;
  timeline: Timeline;
  handle?: string;
};

const Ctx = createContext<RenderInfo | null>(null);
export const RenderProvider = Ctx.Provider;

export const useRender = (): RenderInfo => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRender() must be used inside <RenderProvider>");
  return c;
};
