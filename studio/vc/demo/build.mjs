// Build a CUE demo from a real narration: words + loudness from an earlier run, compile, write the
// render props. usage: node vc/demo/build.mjs <program.cue> <props.json with job.words> <voice.wav> [aspect]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "../parse.mjs";
import { compile } from "../compile.mjs";
import { wordLoudness, loudnessLookup } from "../loud.mjs";

const [cuePath, propsPath, wavPath, aspect = "9:16"] = process.argv.slice(2);
const src = readFileSync(cuePath, "utf8");
const prog = parse(src);
const need = prog.scenes.reduce((n, s) => n + s.say.split(/\s+/).filter(Boolean).length, 0);
const allWords = JSON.parse(readFileSync(propsPath, "utf8")).job.words;
const words = allWords.slice(0, need);
const z = wordLoudness(wavPath, words);
const t0 = performance.now();
const plan = compile(src, { words, loudAt: loudnessLookup(words, z) });
const ms = performance.now() - t0;
const end = words[words.length - 1].end + 0.6;
mkdirSync("public/cue/demo", { recursive: true });
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", wavPath, "-t", end.toFixed(2), "-ac", "1", "public/cue/demo/voice.wav"]);
writeFileSync("out/cue_props.json", JSON.stringify({ plan, aspect, audio: "cue/demo/voice.wav", captions: true }));
writeFileSync("out/cue_plan.json", JSON.stringify(plan, null, 1));
console.log(`compiled ${prog.scenes.length} scenes, ${words.length} words in ${ms.toFixed(1)} ms · duration ${plan.duration}s · holds ${JSON.stringify(plan.holds)}`);
console.log("motion:", plan.motion.map((m) => `${m.scene}: ${m.units}u synced=${m.synced} shortened=${m.shortened} early=${m.early} demoted=${m.demoted}`).join(" | "));
console.log("diagnostics:", plan.diagnostics.length ? plan.diagnostics.join("\n  ") : "none");
