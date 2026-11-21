import test from "node:test";
import assert from "node:assert/strict";
import { parse, CueError } from "./parse.mjs";
import { compile } from "./compile.mjs";
import { CANVAS } from "./layout.mjs";

const SRC = `
style cohort-zero
aspect 9:16 1:1 16:9
scene hook mood=tense
  say "Har campus mein ek banda hota hai jo sab ko jaanta hai"
  kicker "Campus"
  title "Ek banda jo sab ko jaanta hai" emphasis="banda"
scene stat mood=serious
  say "Lekin seventy percent students kabhi start hi nahi karte"
  stat "70%" label="students kabhi start nahi karte" at="seventy"
scene steps mood=hype
  say "Teen kaam karo idea team aur launch"
  list "Idea|Team|Launch"
scene end mood=warm
  say "Cohort Zero join karo"
  quote "Start before you're ready" by="Cohort Zero"
`;

// fake voice: words in order, 0.3 s each, 0.25 s pause between scenes
function voice(src) {
  const p = parse(src);
  const words = [];
  let t = 0.2;
  for (const s of p.scenes) {
    for (const w of s.say.split(/\s+/)) { words.push({ w, start: t, end: t + 0.26 }); t += 0.3; }
    t += 0.25;
  }
  return words;
}

test("parser: good program", () => {
  const p = parse(SRC);
  assert.equal(p.scenes.length, 4);
  assert.deepEqual(p.aspects, ["9:16", "1:1", "16:9"]);
  assert.deepEqual(p.scenes[2].elements[0].items, ["Idea", "Team", "Launch"]);
  assert.equal(p.scenes[1].elements[0].at, "seventy");
});

test("parser: errors carry line numbers and a fix hint", () => {
  assert.throws(() => parse('scene a\n  title "x" \n  wobble "y"'), (e) => e instanceof CueError && e.line === 3 && /unknown element/.test(e.message));
  assert.throws(() => parse('scene a\n  stat "seventy percent of all"'), /short number/);
  assert.throws(() => parse('scene a\n  title "unclosed'), /unclosed quote/);
  assert.throws(() => parse('scene a mood=sleepy\n  title "x"'), /mood must be one of/);
});

test("time: elements land on the word that names them", () => {
  const words = voice(SRC);
  const plan = compile(SRC, { words });
  const stat = plan.aspects["9:16"].scenes[1];
  const seventy = words.find((w) => w.w === "seventy");
  const box = stat.boxes.find((b) => b.kind === "stat");
  assert.ok(Math.abs(box.enter.t - (seventy.start - 0.08)) < 1e-6, `stat enters at ${box.enter.t}, voice says seventy at ${seventy.start}`);
  const items = plan.aspects["9:16"].scenes[2].boxes.filter((b) => b.kind === "item");
  const said = ["idea", "team", "launch"].map((x) => words.find((w) => w.w === x).start - 0.08);
  items.forEach((b, i) => assert.ok(Math.abs(b.enter.t - said[i]) < 1e-6, `item ${i}`));
  const title = plan.aspects["9:16"].scenes[0].boxes.find((b) => b.kind === "title");
  assert.equal(title.pulse.t, words.find((w) => w.w === "banda").start);
});

test("time: cuts never fall inside speech; they snap to a beat when one is in the gap", () => {
  const words = voice(SRC);
  const p = parse(SRC);
  const lastOfScene0 = words[p.scenes[0].say.split(/\s+/).length - 1];
  const beat = lastOfScene0.end + 0.1;
  const plan = compile(SRC, { words, beats: [beat, 99] });
  const sc = plan.aspects["9:16"].scenes;
  assert.ok(Math.abs(sc[0].end - beat) < 1e-3);
  for (let i = 0; i < sc.length - 1; i++) {
    assert.ok(sc[i].end >= sc[i].speech[1] && sc[i].end <= sc[i + 1].speech[0], `cut ${i} inside speech`);
    assert.equal(sc[i].end, sc[i + 1].start);
  }
});

test("space: every box inside the safe area, no overlaps, every aspect", () => {
  const plan = compile(SRC, { words: voice(SRC) });
  for (const [aspect, a] of Object.entries(plan.aspects)) {
    const S = CANVAS[aspect].safe;
    for (const sc of a.scenes) {
      for (const b of sc.boxes) {
        assert.ok(b.x >= S.x0 - 1 && b.x + b.w <= S.x1 + 1 && b.y >= S.y0 - 1 && b.y + b.h <= S.y1 + 1, `${aspect} ${sc.id} ${b.kind} outside safe area`);
      }
      const bs = sc.boxes;
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const A = bs[i], B = bs[j];
        const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
        assert.ok(!overlap, `${aspect} ${sc.id}: ${A.kind} overlaps ${B.kind}`);
      }
    }
  }
});

test("space: hierarchy — the title is always much bigger than its kicker", () => {
  const plan = compile(SRC, { words: voice(SRC) });
  for (const a of Object.values(plan.aspects)) {
    const bs = a.scenes[0].boxes;
    assert.ok(bs.find((b) => b.kind === "title").fontSize >= 2 * bs.find((b) => b.kind === "kicker").fontSize);
  }
});

test("space: too much text is reported, never overflowed", () => {
  const long = "scene a\n" + Array.from({ length: 16 }, (_, i) => `  body "This is a very long paragraph number ${i} that keeps going and going far past what fits"`).join("\n");
  const plan = compile(long);
  assert.ok(plan.diagnostics.some((d) => /does not fit|below the readable/.test(d)), plan.diagnostics.join("; "));
  assert.ok(plan.aspects["9:16"].scenes[0].boxes.every((b) => b.y + b.h <= CANVAS["9:16"].safe.y1 + 1));
});

test("space x time: a scene with more to read than time to read it is flagged", () => {
  const src = 'scene a\n  say "Suno"\n  body "Seven reasons why most students never start a company and what to do"\n  body "Number one is fear and number two is the lack of a team"';
  const plan = compile(src, { words: [{ w: "Suno", start: 0.1, end: 0.4 }] });
  assert.ok(plan.diagnostics.some((d) => /too fast to read/.test(d)), plan.diagnostics.join("; "));
  const ok = compile(SRC, { words: voice(SRC) });
  assert.ok(!ok.diagnostics.some((d) => /too fast to read/.test(d)), ok.diagnostics.join("; "));
});

test("deterministic: same input + seed -> identical plan; another seed varies motion only", () => {
  const words = voice(SRC);
  const a = JSON.stringify(compile(SRC, { words, seed: 7 }));
  const b = JSON.stringify(compile(SRC, { words, seed: 7 }));
  assert.equal(a, b);
  const p1 = compile(SRC, { words, seed: 1 }), p2 = compile(SRC, { words, seed: 2 });
  const geo = (p) => p.aspects["9:16"].scenes.map((s) => s.boxes.map((b) => [b.x, b.y, b.fontSize, b.enter.t]));
  assert.deepEqual(geo(p1), geo(p2));
});

test("no timestamps: falls back to an estimate and says so", () => {
  const plan = compile(SRC);
  assert.ok(plan.duration > 3);
  assert.ok(plan.diagnostics.some((d) => /estimated/.test(d)));
});
