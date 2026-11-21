// CUE — the studio's video language. A free LLM writes a few lines of INTENT; the compiler does the art
// direction (layout, timing to the voice, motion). This file: text -> AST, with line-numbered errors that
// are written to be fed straight back to the LLM for self-repair.
//
//   style cohort-zero
//   aspect 9:16 1:1 16:9
//   scene hook mood=tense
//     say "Har campus mein ek banda hota hai jo sab ko jaanta hai"
//     kicker "CAMPUS"
//     title "Ek banda" emphasis="banda"
//     stat "70%" label="students kabhi start nahi karte" at="70%"
//     list "Idea|Team|Launch"
//     quote "Start before you're ready" by="Cohort Zero"
//     shot close-up
//
// One element per line: <role> "<text>" key=value key="value with spaces"

export const ROLES = ["kicker", "title", "body", "stat", "list", "quote", "caption", "shot"];
export const MOODS = ["calm", "tense", "hype", "warm", "serious"];
const SHOTS = ["wide", "medium", "close-up", "three-quarter", "push-in", "pull-out"];

export class CueError extends Error {
  constructor(line, msg) { super(`line ${line}: ${msg}`); this.line = line; }
}

function tokens(src, line) {
  const out = [];
  const re = /\s*(?:([A-Za-z_][\w-]*)=("(?:[^"\\]|\\.)*"|[^\s"]+)|("(?:[^"\\]|\\.)*")|([^\s"=]+))/y;
  let m, pos = 0;
  const s = src.trimEnd();
  while (pos < s.length) {
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m || m[0].length === 0) throw new CueError(line, `cannot read near: ${s.slice(pos, pos + 20)} (unclosed quote?)`);
    pos = re.lastIndex;
    const unq = (q) => q.slice(1, -1).replace(/\\(.)/g, "$1");
    if (m[1]) out.push({ k: m[1], v: m[2].startsWith('"') ? unq(m[2]) : m[2] });
    else if (m[3]) out.push({ str: unq(m[3]) });
    else out.push({ word: m[4] });
  }
  return out;
}

export function parse(src) {
  const prog = { style: "default", aspects: ["9:16"], bpm: null, seed: 1, scenes: [] };
  let scene = null;
  String(src).split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const text = raw.replace(/(^|\s)#.*$/, "");
    if (!text.trim()) return;
    const indented = /^\s/.test(text);
    const t = tokens(text.trim(), line);
    const head = t[0].word;
    if (!head) throw new CueError(line, `a line must start with a keyword, got ${JSON.stringify(t[0].str ?? t[0].k)}`);
    if (!indented) {
      if (head === "style") prog.style = t[1]?.word || t[1]?.str || "default";
      else if (head === "aspect") {
        prog.aspects = t.slice(1).map((x) => x.word);
        for (const a of prog.aspects) if (!/^\d+:\d+$/.test(a || "")) throw new CueError(line, `aspect must look like 9:16, got ${a}`);
      } else if (head === "bpm") prog.bpm = Number(t[1]?.word) || null;
      else if (head === "seed") prog.seed = Number(t[1]?.word) || 1;
      else if (head === "scene") {
        const id = t[1]?.word;
        if (!id) throw new CueError(line, "scene needs a name: scene hook");
        if (prog.scenes.some((s) => s.id === id)) throw new CueError(line, `scene name "${id}" is used twice`);
        const kv = Object.fromEntries(t.slice(2).filter((x) => x.k).map((x) => [x.k, x.v]));
        if (kv.mood && !MOODS.includes(kv.mood)) throw new CueError(line, `mood must be one of ${MOODS.join(", ")}`);
        scene = { id, mood: kv.mood || "calm", say: "", elements: [], shot: null, line };
        prog.scenes.push(scene);
      } else throw new CueError(line, `unknown top-level keyword "${head}" (use style, aspect, bpm, seed, scene; indent scene lines)`);
      return;
    }
    if (!scene) throw new CueError(line, "indented line before any scene");
    if (head === "say") {
      if (t[1]?.str == null) throw new CueError(line, 'say needs quoted text: say "..."');
      scene.say = (scene.say ? scene.say + " " : "") + t[1].str;
      return;
    }
    if (!ROLES.includes(head)) throw new CueError(line, `unknown element "${head}" (use say, ${ROLES.join(", ")})`);
    if (head === "shot") {
      const v = t[1]?.word || t[1]?.str;
      if (!SHOTS.includes(v)) throw new CueError(line, `shot must be one of ${SHOTS.join(", ")}`);
      scene.shot = v;
      return;
    }
    if (t[1]?.str == null) throw new CueError(line, `${head} needs quoted text: ${head} "..."`);
    const kv = Object.fromEntries(t.slice(2).filter((x) => x.k).map((x) => [x.k, x.v]));
    const el = { role: head, text: t[1].str, ...kv, line };
    if (head === "list") el.items = el.text.split("|").map((s) => s.trim()).filter(Boolean);
    if (head === "list" && (el.items.length < 2 || el.items.length > 6)) throw new CueError(line, "a list needs 2-6 items separated by |");
    if (head === "stat" && el.text.length > 8) throw new CueError(line, `a stat is a short number like "70%" (got "${el.text}"); put words in label=`);
    scene.elements.push(el);
  });
  if (!prog.scenes.length) throw new CueError(1, "no scenes");
  for (const s of prog.scenes) if (!s.say && !s.elements.length) throw new CueError(s.line, `scene ${s.id} is empty`);
  return prog;
}
