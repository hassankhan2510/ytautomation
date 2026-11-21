import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parse.mjs";
import { compile } from "./compile.mjs";
import { spring, omegaFor, cartoon, FEELS, FPS } from "./motion.mjs";

const SRC = `
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
`;
const voice = (src) => { const p = parse(src); const w = []; let t = 0.2; for (const s of p.scenes) { for (const x of s.say.split(/\s+/)) { w.push({ w: x, start: t, end: t + 0.26 }); t += 0.3; } t += 0.25; } return w; };

test("spring: solved omega settles within the duration (2%)", () => {
  for (const [name, F] of Object.entries(FEELS)) for (const d of [0.25, 0.5, 0.8]) {
    const w = omegaFor(F.zeta, d);
    for (let t = d; t < d + 2; t += 0.01) assert.ok(Math.abs(spring(t, F.zeta, w) - 1) <= 0.0201, `${name} d=${d} not settled at ${t.toFixed(2)}`);
  }
});

test("cartoon filter: wind-up before a move and overshoot after it, no change on flat curves", () => {
  const step = [...Array(10).fill(0), ...Array(10).fill(1)];
  const f = cartoon(step, 1.5);
  assert.ok(Math.min(...f.slice(0, 10)) < -0.01, "anticipation dip");
  assert.ok(Math.max(...f.slice(10)) > 1.01, "follow-through");
  assert.deepEqual(cartoon(Array(8).fill(3), 1.5).map((x) => +x.toFixed(9)), Array(8).fill(3));
});

test("deadlines: every unit has settled before its scene exits", () => {
  const plan = compile(SRC, { words: voice(SRC) });
  for (const sc of plan.aspects["9:16"].scenes) for (const u of sc.units) {
    const settled = u.f0 + u.enter.ty.length - 1;
    assert.ok(settled <= u.exit.f0 + 1, `${sc.id} ${u.kind} "${u.text}" settles at frame ${settled}, exits at ${u.exit.f0}`);
  }
});

test("attention: big moves never overlap in their salient phase (one focus at a time)", () => {
  const plan = compile(SRC, { words: voice(SRC), debug: true });
  for (const sc of plan.aspects["9:16"].scenes) {
    const big = sc.motionDebug.filter((g) => g.big && !g.demoted).sort((a, b) => a.t0 - b.t0);
    for (let i = 0; i + 1 < big.length; i++) {
      const g = big[i], end = g.t0 + (g.synced ? 0 : g.stagger * (g.words - 1)) + 0.55 * g.d;
      assert.ok(end <= big[i + 1].t0 + 1e-6, `${sc.id}: ${g.kind} still salient at ${end.toFixed(3)} when ${big[i + 1].kind} starts at ${big[i + 1].t0.toFixed(3)}`);
    }
  }
});

test("kinetic sync: title words the voice says appear as they are said", () => {
  const words = voice(SRC);
  const plan = compile(SRC, { words });
  const units = plan.aspects["9:16"].scenes[0].units.filter((u) => u.kind === "title");
  const banda = units.find((u) => u.text === "banda");
  const said = words.find((w) => w.w === "banda").start;
  assert.ok(Math.abs(banda.f0 / FPS - (said - 0.05)) <= 1 / FPS, `banda at ${banda.f0 / FPS}, said at ${said}`);
  assert.ok(banda.accent && banda.pulse, "emphasis word is accented and pulses");
  assert.ok(Math.min(...banda.pulse.sc) < 1, "pulse has a wind-up before the hit");
});

test("voice loudness: a louder word hits harder", () => {
  const words = voice(SRC);
  const loud = compile(SRC, { words, loudAt: () => 2 }), soft = compile(SRC, { words, loudAt: () => -2 });
  const item = (p) => p.aspects["9:16"].scenes[2].units.find((u) => u.kind === "item");
  assert.ok(Math.abs(item(loud).enter.ty[0]) > Math.abs(item(soft).enter.ty[0]) || item(loud).feel !== item(soft).feel);
  const stat = (p) => p.aspects["9:16"].scenes[1].units.find((u) => u.kind === "stat");
  assert.ok(stat(loud).enter.sc[0] > stat(soft).enter.sc[0], "heavier slam when louder");
});

test("count-up: a stat counts to its value and ends exactly on it", () => {
  const plan = compile(SRC, { words: voice(SRC) });
  const st = plan.aspects["9:16"].scenes[1].units.find((u) => u.kind === "stat");
  assert.equal(st.count.prefix, "");
  assert.equal(st.count.suffix, "%");
  assert.equal(st.count.values.at(-1), 70);
});
