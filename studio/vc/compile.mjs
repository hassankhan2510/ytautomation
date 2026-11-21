// CUE COMPILER: program text (+ the voice's word timestamps, + music beats) -> a fully resolved PLAN:
// every box's position, size, type size, lines, entrance/exit/pulse times and camera, for each aspect.
// Deterministic: same program + timestamps + seed -> identical plan. The renderer only draws the plan.
import { parse } from "./parse.mjs";
import { solveTime } from "./timing.mjs";
import { solveLayout, CANVAS } from "./layout.mjs";
import { getStyle } from "./style.mjs";
import { choreograph } from "./choreo.mjs";
import { compileMotion, FPS } from "./motion.mjs";

export function compile(src, opts = {}) {
  const prog = typeof src === "string" ? parse(src) : src;
  prog.scenes.forEach((s) => s.elements.forEach((e, i) => { e.order = i; }));
  const time = solveTime(prog, opts);
  const seed = opts.seed ?? prog.seed;
  const diagnostics = [...time.diagnostics];
  const aspects = {};
  const motionStats = [];
  for (const aspect of opts.aspects || prog.aspects) {
    const scenes = time.scenes.map((ts, i) => {
      const lay = solveLayout(prog.scenes[i].elements, aspect, prog.style);
      lay.diagnostics.forEach((d) => diagnostics.push(`[${aspect}] scene ${ts.id}: ${d}`));
      const { boxes, camera } = choreograph(ts, lay.boxes, seed);
      const motion = compileMotion(ts, lay.boxes, { loudAt: opts.loudAt });
      if (aspect === (opts.aspects || prog.aspects)[0]) motionStats.push({ scene: ts.id, ...motion.stats });
      return { id: ts.id, mood: ts.mood, start: r3(ts.start), end: r3(ts.end), speech: ts.speech.map(r3), hold: ts.hold || 0, scale: lay.scale, camera, boxes, units: motion.units, motionDebug: opts.debug ? motion.debug : undefined };
    });
    aspects[aspect] = { canvas: { w: CANVAS[aspect].w, h: CANVAS[aspect].h }, scenes };
  }
  return { version: 1, style: prog.style, duration: r3(time.duration), seed, fps: FPS, colors: getStyle(prog.style).colors, captions: time.scenes.flatMap((s) => s.words.map((w) => ({ w: w.w, start: r3(w.start), end: r3(w.end) }))), audio: time.audio, motion: motionStats, holds: time.holds, aspects, diagnostics: [...new Set(diagnostics)] };
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
