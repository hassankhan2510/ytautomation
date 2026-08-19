/**
 * PHASE 3.5 (optional) — EDITOR GATE.
 *
 * A senior-editor pass that scores every section against a rubric (specificity, evidence density, absence
 * of filler, argument strength) and writes runs/<id>/quality.json. With --fix it clears the weakest sections
 * (status -> planned, stages.write=false) so a re-run of `write` regenerates just those — a targeted quality
 * loop, not a fragile full rewrite.
 *
 *   PB_ID=gnn node src/pb_edit.mjs           # score + report
 *   PB_ID=gnn node src/pb_edit.mjs --fix     # also reset the weakest sections for rewrite
 */
import fs from "node:fs";
import path from "node:path";
import { llmJSON, setBudgetFile } from "./pb_llm.mjs";
import { allSections } from "./pb_schema.mjs";
import { loadSpine, saveSpine, runPaths, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
const FIX = !!arg("fix", false);
const THRESH = Number(arg("thresh", 3));
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

async function scoreBatch(items) {
  const sys = `You are a ruthless senior editor for a top-1% business/tech book. Score each section 1-5 on OVERALL
quality (5 = specific, evidence-backed, zero filler, sharp argument; 1 = vague/generic/padded). Return ONLY
JSON: {"scores":[{"id":"S3","score":4,"why":"short reason","fix":"one concrete improvement"}]}. Be harsh.`;
  const usr = items.map((x) => `[${x.id}] ${x.title}\nThesis: ${x.thesis}\nOpening: ${x.opening}`).join("\n\n");
  return await llmJSON(sys, usr, { tier: "mid", maxTokens: 1200, temperature: 0.3 });
}

async function main() {
  const p = runPaths(ID); setBudgetFile(p.budget);
  const spine = loadSpine(ID);
  log(`EDIT id=${ID}`);
  const secs = allSections(spine).filter((x) => x.section.content?.paragraphs?.length);
  const items = secs.map(({ section }) => ({ id: section.id, title: section.title, thesis: section.thesis, opening: (section.content.paragraphs[0]?.text || "").slice(0, 300) }));

  const results = [];
  for (let i = 0; i < items.length; i += 5) {
    const r = await scoreBatch(items.slice(i, i + 5)).catch(() => null);
    if (r && Array.isArray(r.scores)) results.push(...r.scores);
  }
  const byId = new Map(results.map((r) => [r.id, r]));
  const avg = results.length ? (results.reduce((a, b) => a + (Number(b.score) || 0), 0) / results.length).toFixed(2) : "n/a";
  const weak = results.filter((r) => (Number(r.score) || 5) < THRESH);

  fs.writeFileSync(path.join(p.dir, "quality.json"), JSON.stringify({ average: avg, scores: results }, null, 2));
  log(`  average quality ${avg}/5 across ${results.length} scored sections`);
  log(`  ${weak.length} below ${THRESH}: ${weak.map((w) => w.id).join(", ") || "none"}`);
  for (const w of weak.slice(0, 12)) log(`     ${w.id}: ${w.why} -> ${w.fix}`);

  if (FIX && weak.length) {
    const ids = new Set(weak.map((w) => w.id));
    for (const { section } of secs) if (ids.has(section.id)) { section.content = null; section.status = "planned"; }
    spine.stages.write = false; spine.stages.verify = false;
    saveSpine(ID, spine);
    log(`  ↺ reset ${ids.size} weak sections — re-run write (then verify) to regenerate them`);
  }
}
main().catch((e) => { console.error("edit failed:", e.message); process.exit(1); });
