/**
 * CASTING — the director's knowledge of WHICH scene suits WHICH kind of line.
 *
 * The writer tags every script line with an INTENT ("this line is a date", "a comparison", "a myth"…).
 * Casting turns that into a short, high-quality candidate list per line, so the director LLM chooses
 * among ~6 scenes that genuinely fit instead of skimming a 90-item menu and defaulting to the same
 * two or three. Ordered best-first; casting enforces no repeats + family variety + wildcards.
 */
export const INTENTS = {
  hook: ["glitchTitle", "warp", "zoomThrough", "stomp", "spotlight", "codeRain", "tape", "splitFlap", "auroraType", "pov", "flip3d", "phoneCall", "newspaperSpin"],
  question: ["search", "spotlight", "iceberg", "slotMachine", "poll", "zoomThrough", "declassified", "phoneCall", "magnifier"],
  date: ["yearRewind", "calendar", "history", "splitFlap", "archiveFilm", "typewriter", "bookChapter", "newspaperSpin"],
  place: ["parallax", "locate", "globe", "archiveFilm", "radar", "photo", "mapRoute", "boardingPass"],
  person: ["museumFrame", "parallax", "archiveFilm", "photo", "quote", "tweet", "chat", "polaroidStack"],
  bigNumber: ["counter", "burst", "statGrid", "meter", "ring", "price", "splitFlap", "heartbeat"],
  comparison: ["scaleCompare", "versus", "bars", "scoreboard", "thenNow", "beforeAfter", "venn", "strike"],
  change: ["lineChart", "thenNow", "history", "roadmap", "yearRewind", "beforeAfter", "ghGrid", "boardingPass"],
  process: ["roadmap", "isoBuild", "checklist", "neuralNet", "funnel", "mindMap", "pyramid", "list", "circuitBoard", "chalkboard"],
  causeEffect: ["redString", "roadmap", "funnel", "neuralNet", "mindMap", "iceberg", "mapRoute"],
  fact: ["factCard", "highlight", "decode", "flip3d", "splitFlap", "headlines", "maskReveal", "magnifier", "chalkboard"],
  research: ["researchPaper", "factCard", "headlines", "pie", "quadrant", "lineChart", "statGrid", "magnifier", "chalkboard", "dnaHelix"],
  list: ["list", "stickyNotes", "tierList", "cardFan", "orbit", "appGrid", "pie", "checklist", "polaroidStack"],
  myth: ["strike", "verdict", "iceberg", "glitchTitle", "declassified"],
  secret: ["declassified", "spotlight", "zoomThrough", "cardFan", "decode", "iceberg", "codeRain", "magnifier"],
  tech: ["neuralNet", "codeRain", "terminal", "code", "browser", "dotWave", "keyboard", "notifs", "circuitBoard"],
  struggle: ["errorPopups", "loading", "pov", "chat", "typewriter", "timer", "blob", "heartbeat", "phoneCall"],
  news: ["newsBanner", "headlines", "notifs", "tweet", "search", "globe", "phone", "newspaperSpin"],
  quote: ["quote", "typewriter", "tweet", "auroraType", "museumFrame"],
  money: ["price", "receipt", "bars", "counter", "scoreboard", "slotMachine"],
  scale: ["scaleCompare", "globe", "dotWave", "meter", "warp", "solarSystem", "atom"],
  chapter: ["bookChapter", "tape", "warp", "zoomThrough", "prism", "dayStamp"],
  lesson: ["auroraType", "flowField", "maskReveal", "prism", "rotator", "highlight", "blob", "flip3d", "chalkboard"],
  emotion: ["blob", "flowField", "auroraType", "spotlight", "pov", "quote", "heartbeat", "polaroidStack"],
  science: ["dnaHelix", "atom", "solarSystem", "chalkboard", "neuralNet", "scaleCompare", "researchPaper", "dotWave"],
  journey: ["mapRoute", "boardingPass", "locate", "globe", "archiveFilm", "history"],
  cta: ["commentCta", "outro"],
};
export const INTENT_LIST = Object.keys(INTENTS);

/** Families (category) used to spread visual variety across the reel. */
const familyOf = (menuById, id) => menuById.get(id)?.category || "text";
/** Plain kinetic-type primitives — fine, but a reel made of only these looks cheap. */
const PLAIN_TEXT = new Set(["stomp", "flip3d", "highlight", "maskReveal", "decode", "auroraType", "prism", "rotator"]);

/**
 * Pick ~6 candidates per line. Hard rules: nothing already used in this reel, outro only at the end.
 * Soft rules: avoid the previous line's family, cap plain-text scenes, mix in 2 wildcards from
 * families the reel hasn't used yet (creative surprise, still energy-appropriate).
 */
/** Versatile cinematic scenes that can carry almost any line — the wildcard pool for creative surprise. */
const WILDCARDS = ["mapRoute", "solarSystem", "dnaHelix", "newspaperSpin", "phoneCall", "circuitBoard", "globe", "warp", "dotWave", "flowField", "blob", "orbit", "cardFan", "isoBuild", "iceberg", "prism", "burst", "tape", "spotlight", "zoomThrough", "glitchTitle", "neuralNet", "radar", "codeRain", "scaleCompare", "redString", "archiveFilm", "museumFrame", "yearRewind", "declassified"];
const h01 = (...n) => { let x = 0; for (const v of n) x = Math.imul(x ^ (v * 2654435761), 1597334677) >>> 0; return (x % 10007) / 10007; };

/**
 * Pick ~7 candidates per line. Hard rules: nothing already reserved in this reel, outro only at the end,
 * at most 2 plain-text scenes. Soft rules (ranking, never removal): the intent's own best-first order,
 * a penalty for repeating the previous line's family, a lift for documentary scenes in explainers.
 * Plus 2 rotating wildcards from a versatile cinematic pool (seeded, so each video differs).
 */
export function castCandidates({ lines, menu, docBias = false, seed = 1 }) {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const isDoc = (id) => /^DOC:/.test(byId.get(id)?.description || "");
  const used = new Set();
  let plainUsed = 0;
  let prevFam = null;
  return lines.map((line, i) => {
    const intent = INTENTS[line.intent] ? line.intent : "fact";
    const ok = (id) => byId.has(id) && !used.has(id) && id !== "outro" && !(PLAIN_TEXT.has(id) && plainUsed >= 2);
    const ranked = INTENTS[intent]
      .map((id, pos) => ({ id, pos }))
      .filter(({ id }) => ok(id))
      .map(({ id, pos }) => ({ id, score: pos + (familyOf(byId, id) === prevFam ? 2.5 : 0) - (docBias && isDoc(id) ? 1.5 : 0) }))
      .sort((a, b) => a.score - b.score)
      .map((x) => x.id);
    const picks = ranked.slice(0, 5);
    const wild = WILDCARDS.filter((id) => ok(id) && !picks.includes(id))
      .sort((a, b) => h01(seed, i, a.length, a.charCodeAt(0), a.charCodeAt(1)) - h01(seed, i, b.length, b.charCodeAt(0), b.charCodeAt(1)))
      .slice(0, 2);
    const candidates = [...picks, ...wild];
    // Reserve the top pick so later lines get different first choices (the director may still swap).
    const top = candidates[0];
    if (top) {
      used.add(top);
      if (PLAIN_TEXT.has(top)) plainUsed++;
      prevFam = familyOf(byId, top);
    }
    return { intent, candidates };
  });
}

/** Edit-quality score shown in the run summary — keeps the AI honest over time. */
export function scoreEdit(beats, menu) {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const ids = beats.map((b) => b.primitive);
  const unique = new Set(ids).size;
  const families = new Set(ids.map((id) => byId.get(id)?.category)).size;
  const plain = ids.filter((id) => PLAIN_TEXT.has(id)).length;
  const doc = ids.filter((id) => /^DOC:/.test(byId.get(id)?.description || "")).length;
  const repeats = ids.length - unique;
  const score = Math.max(0, Math.min(10, 4 + unique / ids.length * 3 + Math.min(families, 6) * 0.5 - plain * 0.5 - repeats * 1.5));
  return { score: Math.round(score * 10) / 10, unique, total: ids.length, families, plain, doc, repeats };
}
