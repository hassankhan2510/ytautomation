// CUE COMPILER: program text (+ the voice's word timestamps, + music beats) -> a fully resolved PLAN:
// every box's position, size, type size, lines, entrance/exit/pulse times and camera, for each aspect.
// Deterministic: same program + timestamps + seed -> identical plan. The renderer only draws the plan.
import { parse } from "./parse.mjs";
import { solveTime } from "./timing.mjs";
import { solveLayout, CANVAS } from "./layout.mjs";
import { choreograph } from "./choreo.mjs";

export function compile(src, opts = {}) {
  const prog = typeof src === "string" ? parse(src) : src;
  prog.scenes.forEach((s) => s.elements.forEach((e, i) => { e.order = i; }));
  const time = solveTime(prog, opts);
  const seed = opts.seed ?? prog.seed;
  const diagnostics = [...time.diagnostics];
  const aspects = {};
  for (const aspect of opts.aspects || prog.aspects) {
    const scenes = time.scenes.map((ts, i) => {
      const lay = solveLayout(prog.scenes[i].elements, aspect);
      lay.diagnostics.forEach((d) => diagnostics.push(`[${aspect}] scene ${ts.id}: ${d}`));
      const { boxes, camera } = choreograph(ts, lay.boxes, seed);
      // SPACE x TIME: what is on screen must be readable while it is on screen (~4.5 words/s for reels;
      // words the voice is saying at the same time count half — the viewer hears them)
      if (aspect === (opts.aspects || prog.aspects)[0]) {   // timing is the same for every aspect: check once
        const spoken = new Set(ts.words.map((w) => norm(w.w)));
        let load = 0;
        for (const b of boxes) for (const w of b.text.split(/\s+/)) load += spoken.has(norm(w)) ? 0.5 : 1;
        const firstIn = Math.min(...boxes.map((b) => b.enter.t), ts.end);
        const visible = Math.max(0.1, ts.end - firstIn);
        if (boxes.length && load / visible > 4.5) diagnostics.push(`scene ${ts.id}: ${Math.round(load)} words to read in ${visible.toFixed(1)} s — too fast to read; cut text or say more`);
      }
      return { id: ts.id, mood: ts.mood, start: r3(ts.start), end: r3(ts.end), speech: ts.speech.map(r3), scale: lay.scale, camera, boxes };
    });
    aspects[aspect] = { canvas: { w: CANVAS[aspect].w, h: CANVAS[aspect].h }, scenes };
  }
  return { version: 1, style: prog.style, duration: r3(time.duration), seed, aspects, diagnostics: [...new Set(diagnostics)] };
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
