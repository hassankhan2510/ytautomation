// CUE AUTHOR — a free LLM writes the CUE program for a script; the COMPILER checks it and sends its exact
// errors back (line numbers + fix hints) for repair. The voice lines are injected by us, verbatim, so the
// program can never drift from what is spoken. Facts are guarded: no number may appear on screen that the
// line does not contain. A scene that still fails falls back to a safe compiled scene — never a broken video.
import { parse, CueError } from "./parse.mjs";
import { compile } from "./compile.mjs";

export const GRAMMAR = `CUE is a tiny language for short vertical videos. You write the VISUALS for each scene.
Format (exactly):
scene <id> mood=<calm|warm|serious|tense|hype>
  <element lines, indented two spaces>
  shot <wide|medium|close-up|three-quarter|push-in|pull-out>      (optional)
Elements (1-3 per scene, one per line, text in double quotes):
  kicker "<1-2 words, a label above the title>"
  title "<the scene's idea in 2-6 words>" emphasis="<ONE word of the title>"
  body "<a supporting phrase, max 9 words>"
  stat "<a number exactly as in the line, e.g. 70% or 3x or 1,000>" label="<what it counts, max 6 words>"
  list "<item1|item2|item3>"        (2-4 short items, ONLY when the line lists things)
  quote "<a short quotable phrase from the line>" by="<who>"
Rules:
- Do NOT write say lines (the voice lines are added for you, one scene per given line, same order).
- On-screen text uses the SAME language and script as the line (Roman Urdu stays Roman Urdu). Condense, never translate.
- Never invent facts. A stat may only use a number that appears in its line. No number that is not in the line.
- One idea per scene. Prefer: hook = kicker + title (tense/hype); numbers = stat; enumerations = list; emotional lines = title (warm).
- Vary moods and shots across scenes; the first scene grabs attention (tense or hype, push-in).`;

const digits = (s) => (String(s).match(/\d[\d.,]*/g) || []).map((d) => d.replace(/[.,]$/, ""));
const q = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** splice our verbatim say lines into the LLM's program (one per scene, in order) */
export function injectSay(cue, lines) {
  const out = [];
  let k = -1;
  for (const raw of String(cue).replace(/\r/g, "").split("\n")) {
    if (/^\s*say\b/.test(raw)) continue;                                  // the LLM must not write these
    out.push(raw);
    if (/^scene\s+\S+/.test(raw)) { k++; if (k < lines.length) out.push(`  say ${q(lines[k])}`); }
  }
  return { text: out.join("\n"), scenes: k + 1 };
}

/** problems the compiler or the fact guard finds, phrased for the LLM */
export function check(text, lines, compileOpts = {}) {
  const problems = [];
  let prog;
  try { prog = parse(text); } catch (e) { return { problems: [e instanceof CueError ? e.message : String(e)] }; }
  if (prog.scenes.length !== lines.length) problems.push(`write exactly ${lines.length} scenes (one per given line), you wrote ${prog.scenes.length}`);
  prog.scenes.forEach((s, i) => {
    const allowed = new Set(digits(lines[i] || ""));
    for (const e of s.elements) for (const d of digits([e.text, e.label, e.by].filter(Boolean).join(" "))) {
      if (!allowed.has(d)) problems.push(`scene ${s.id} (line ${s.line}): the number ${d} is not in its voice line — remove it`);
    }
    if (!s.elements.length) problems.push(`scene ${s.id}: add at least one element`);
  });
  if (!problems.length) {
    const plan = compile(prog, compileOpts);
    for (const d of plan.diagnostics) if (/does not fit|below the readable|too fast to read/.test(d)) problems.push(d);
  }
  return { problems, prog };
}

function fallbackScene(i, line, lang) {
  const words = String(line).replace(/[^\p{L}\p{N}%'’ -]+/gu, " ").split(/\s+/).filter(Boolean);
  const title = words.slice(0, Math.min(6, words.length)).join(" ") || "…";
  return `scene s${i + 1} mood=${i === 0 ? "tense" : "calm"}\n  title ${q(title)}`;
}

/**
 * lines: what the voice says, one scene each (screen text language). llm(system, user) -> {cue} | null.
 * Returns { cue, rounds, fallbacks, problems }.
 */
export async function author(lines, { llm, title = "", language = "english", style = "cohort-zero", aspects = ["9:16"], maxRepairs = 2, compileOpts = {} } = {}) {
  const header = `style ${style}\naspect ${aspects.join(" ")}\n`;
  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  const user = `Video: ${title || "short reel"} (${language}).\nVoice lines (one scene each, in order):\n${numbered}\n\nReturn ONLY JSON: {"cue":"<the program: ${lines.length} scenes, no say lines>"}`;
  let cue = null, problems = ["no program yet"], rounds = 0, convo = user;
  while (rounds <= maxRepairs) {
    rounds++;
    const r = llm ? await llm(GRAMMAR, convo) : null;
    const body = r && typeof r.cue === "string" ? r.cue.replace(/^\s*(style|aspect)\b.*$/gm, "") : null;
    if (!body) { problems = ["the model returned no program"]; break; }
    const { text } = injectSay(body, lines);
    const res = check(header + text, lines, compileOpts);
    cue = header + text; problems = res.problems;
    if (!problems.length) return { cue, rounds, fallbacks: 0, problems: [] };
    convo = `${user}\n\nYour previous program:\n${body}\n\nThe CUE compiler rejected it:\n- ${problems.slice(0, 8).join("\n- ")}\nFix exactly these problems and return the whole corrected program as JSON {"cue": "..."}.`;
  }
  // last resort: keep every scene that compiles on its own, replace the rest with a safe scene
  let fallbacks = 0;
  const parts = [];
  const scenesText = cue ? cue.slice(header.length).split(/\n(?=scene\s)/).filter((x) => /^scene\s/.test(x.trim())) : [];
  for (let i = 0; i < lines.length; i++) {
    let one = scenesText[i];
    const ok = one && !check(`${header}${one.replace(/\n\s*say .*$/m, "")}\n  say ${q(lines[i])}`, [lines[i]], compileOpts).problems.length;
    if (!ok) { one = fallbackScene(i, lines[i], language); fallbacks++; }
    parts.push(injectSay(one.replace(/^\s*say\b.*$/gm, ""), [lines[i]]).text.replace(/^scene\s+\S+/, `scene s${i + 1}`));
  }
  const final = header + parts.join("\n");
  return { cue: final, rounds, fallbacks, problems: check(final, lines, compileOpts).problems };
}
