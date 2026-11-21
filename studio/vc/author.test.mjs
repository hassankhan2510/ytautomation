import test from "node:test";
import assert from "node:assert/strict";
import { author, injectSay, check } from "./author.mjs";
import { parse } from "./parse.mjs";

const LINES = ["Lekin seventy percent students kabhi start nahi karte, 70% log!", "Teen kaam karo: idea, team aur launch.", "Cohort Zero join karo."];

test("say lines are ours, verbatim, one per scene — the model's own say lines are dropped", () => {
  const { text } = injectSay('scene a mood=tense\n  say "invented"\n  title "X"\nscene b\n  title "Y"', ["one", "two"]);
  const p = parse(text);
  assert.deepEqual(p.scenes.map((s) => s.say), ["one", "two"]);
});

test("fact guard: a number that is not in the voice line is rejected", () => {
  const bad = 'scene a mood=hype\n  say "Teen kaam karo"\n  stat "90%" label="log"';
  assert.ok(check(bad, ["Teen kaam karo"]).problems.some((p) => /90%? is not in its voice line|number 90/.test(p)));
});

test("repair loop: compiler errors go back to the model, and the fixed program is accepted", async () => {
  const calls = [];
  const llm = async (sys, user) => {
    calls.push(user);
    if (calls.length === 1) return { cue: 'scene hook mood=sleepy\n  title "Seventy percent"\nscene steps\n  list "Idea|Team|Launch"\nscene end\n  title "Join"' };
    return { cue: 'scene hook mood=tense\n  stat "70%" label="students kabhi start nahi karte"\nscene steps mood=hype\n  list "Idea|Team|Launch"\nscene end mood=warm\n  title "Cohort Zero join karo" emphasis="join"' };
  };
  const r = await author(LINES, { llm });
  assert.equal(r.rounds, 2);
  assert.equal(r.fallbacks, 0);
  assert.deepEqual(r.problems, []);
  assert.match(calls[1], /mood must be one of/);
  assert.deepEqual(parse(r.cue).scenes.map((s) => s.say), LINES);
});

test("a model that never gets it right still yields a compiling program (safe fallback scenes)", async () => {
  const r = await author(LINES, { llm: async () => ({ cue: 'scene a\n  wobble "x"' }), maxRepairs: 1 });
  assert.equal(r.fallbacks, 3);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(parse(r.cue).scenes.map((s) => s.say), LINES);
});

test("no model at all (no key) -> safe program, never a crash", async () => {
  const r = await author(LINES, { llm: null });
  assert.deepEqual(r.problems, []);
  assert.equal(parse(r.cue).scenes.length, 3);
});
