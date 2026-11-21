// CUE ENGINE in the video pipeline. Runs after narration (job.words + the voice-only track exist):
//   lines (what is spoken, screen language) -> free LLM writes CUE -> compiler repairs/guards -> compile with
//   the real word timings + per-word voice loudness -> music ducking curve -> render props for `Cue`.
//   node vc/pipeline.mjs out/props.json out/cue_props.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { author } from "./author.mjs";
import { compile } from "./compile.mjs";
import { parse } from "./parse.mjs";
import { wordLoudness, loudnessLookup } from "./loud.mjs";

const [propsPath = "out/props.json", outPath = "out/cue_props.json"] = process.argv.slice(2);
const props = JSON.parse(readFileSync(propsPath, "utf8"));
const job = props.job;
const beats = job.beats.filter((b) => String(b.text || "").trim());
const lines = beats.map((b) => String(b.text).replace(/\s+/g, " ").trim());
const words = job.words || [];
const summary = (s) => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n", { flag: "a" }); };

let llm = null;
try {
  const { groqJSON } = await import("../../theranos-doc/scripts/lib_groq.mjs");
  llm = (system, user) => groqJSON(system, user, { maxTokens: 2500, temperature: 0.6 });
} catch { console.log("  (no LLM client — safe program)"); }

const style = process.env.CUE_STYLE || "cohort-zero";
const aspects = (process.env.CUE_ASPECTS || "9:16").split(/[ ,]+/).filter(Boolean);
const t0 = Date.now();
const a = await author(lines, { llm, title: job.title || "", language: job.language || "english", style, aspects, compileOpts: { words } });
summary(`🧩 **CUE program**: ${lines.length} scenes · written in ${a.rounds} round(s) · ${a.fallbacks} safe fallback scene(s) · ${(Date.now() - t0) / 1000}s`);
writeFileSync(path.join(path.dirname(outPath), "program.cue"), a.cue);

// per-word voice loudness from the VOICE-ONLY narration track
const voicePath = job.audio ? path.join("public", job.audio) : null;
let loudAt;
if (voicePath && existsSync(voicePath) && words.length) {
  try { loudAt = loudnessLookup(words, wordLoudness(voicePath, words)); } catch (e) { console.log(`  (loudness skipped: ${e.message})`); }
}
const c0 = performance.now();
const plan = compile(parse(a.cue), { words, loudAt });
const ms = performance.now() - c0;

// music ducking (compiler-owned): music sits under the voice, rises in real pauses and at the end
if (job.music) {
  const step = 0.1, n = Math.ceil(plan.duration / step) + 1, speech = plan.captions || [];
  const UNDER = 0.16, OPEN = 0.42;
  const g = Array.from({ length: n }, (_, i) => {
    const t = i * step;
    const near = speech.some((w) => t >= w.start - 0.25 && t <= w.end + 0.35);
    return near ? UNDER : OPEN;
  });
  for (let i = 1; i < n; i++) g[i] = Math.min(g[i], g[i - 1] + 0.03);          // rise slowly (no pumping)
  for (let i = n - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + 0.06);     // duck just before speech
  plan.music = { src: job.music, step, gain: g.map((x) => +x.toFixed(3)), loop: !job.musicFit };
}
writeFileSync(outPath, JSON.stringify({ plan, aspect: aspects[0], audio: job.audio || null, captions: true }));
summary(`⚙️ **Compiled** in ${ms.toFixed(0)} ms · ${plan.duration.toFixed(1)} s · holds: ${plan.holds.length ? plan.holds.map((h) => `${h.dur}s`).join(", ") : "none"} · motion: ${plan.motion.reduce((x, m) => x + m.synced, 0)} voice-synced titles, ${plan.motion.reduce((x, m) => x + m.demoted, 0)} demoted moves`);
if (plan.diagnostics.length) summary("Compiler notes:\n" + plan.diagnostics.map((d) => `- ${d}`).join("\n"));
