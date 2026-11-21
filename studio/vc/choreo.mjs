// MOTION SOLVE: how each box enters, reacts and leaves — chosen from what the element IS (role) and how the
// scene FEELS (mood), varied by a seed but only inside the set of moves that suit that role. Timing comes
// from the time solve (an element enters as the voice names it), so motion is tied to speech, not to a
// fixed template clock.

export function rng(...keys) {
  let h = 2166136261;
  for (const ch of keys.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {                                    // mulberry32
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOVES = {
  kicker: ["track-in", "fade-rise"],
  title: ["mask-up", "rise", "scale-in"],
  body: ["fade-rise", "mask-up"],
  stat: ["count-up", "scale-in"],
  label: ["fade-rise"],
  item: ["slide-in", "pop"],
  quote: ["word-reveal", "fade-rise"],
  by: ["fade-rise"],
};
const MOOD = {
  calm: { speed: 1.2, ease: "outCubic", exit: "fade" },
  warm: { speed: 1.1, ease: "outCubic", exit: "fade" },
  serious: { speed: 1.0, ease: "outQuart", exit: "fade-down" },
  tense: { speed: 0.85, ease: "outQuart", exit: "cut" },
  hype: { speed: 0.72, ease: "outBack", exit: "zoom-out" },
};
const BASE_DUR = { "track-in": 0.45, "fade-rise": 0.4, "mask-up": 0.5, rise: 0.45, "scale-in": 0.4, "count-up": 0.75, "slide-in": 0.35, pop: 0.3, "word-reveal": 0.9 };
const CAMERA = {
  wide: [1, 1], medium: [1.02, 1.04], "close-up": [1.08, 1.12], "three-quarter": [1.04, 1.06], "push-in": [1, 1.07], "pull-out": [1.07, 1],
};

export function choreograph(scene, boxes, seed = 1) {
  const m = MOOD[scene.mood] || MOOD.calm;
  const exitDur = m.exit === "cut" ? 0 : 0.22;
  const out = boxes.map((b, n) => {
    const el = scene.elements.find((e) => e.order === b.el);
    const r = rng(seed, scene.id, b.el, b.kind, b.item ?? "");
    const options = MOVES[b.kind] || ["fade-rise"];
    const type = options[Math.floor(r() * options.length)];
    let t = el?.t ?? scene.start;
    if (b.kind === "item" && el?.itemTimes) t = el.itemTimes[b.item];
    if (b.kind === "label" || b.kind === "by") t += 0.15;           // the sub-line follows its headline
    t = Math.min(t, scene.end - exitDur - 0.25);
    const dur = Math.round(BASE_DUR[type] * m.speed * 1000) / 1000;
    const box = { ...b, enter: { type, t: Math.max(scene.start, t), dur, ease: m.ease, stagger: type === "mask-up" ? 0.07 : type === "word-reveal" ? 0.06 : 0 },
      exit: { type: m.exit, t: scene.end - exitDur, dur: exitDur } };
    if (el?.pulse != null && b.kind !== "label" && b.kind !== "by") box.pulse = { t: el.pulse, word: el.emphasis, dur: 0.32 };
    return box;
  });
  const [c0, c1] = CAMERA[scene.shot || (scene.mood === "hype" ? "push-in" : "medium")];
  return { boxes: out, camera: { from: c0, to: c1 } };
}
