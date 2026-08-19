/**
 * ORCHESTRATOR — runs the whole Playbook Studio end to end, resumably.
 *
 * Each phase is a separate, idempotent, checkpointing script; this driver runs them in order, passing
 * PB_ID through. The "fillable" phases (write, verify, graphics) are retried until their stage flag flips,
 * so a rate-limit pause or a transient failure just means the next attempt continues where it stopped.
 *
 *   PB_ID=gnn PB_TOPIC="The Future of Graph Neural Networks" node src/pb_run.mjs
 *   PB_ID=gnn node src/pb_run.mjs --from=graphics        # resume from a phase
 *   PB_ID=gnn node src/pb_run.mjs --only=render
 *   PB_ID=gnn node src/pb_run.mjs --edit                 # insert the editor gate after verify
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaths, arg, log } from "./pb_util.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ID = arg("id", process.env.PB_ID || (process.env.PB_TOPIC ? undefined : ""));
const FROM = arg("from", "");
const ONLY = arg("only", "");
const EDIT = !!arg("edit", false);

const PHASES = [
  { name: "research", script: "pb_research.mjs", fillable: false },
  { name: "architect", script: "pb_architect.mjs", fillable: false },
  { name: "write", script: "pb_write.mjs", fillable: true },
  ...(EDIT ? [{ name: "edit", script: "pb_edit.mjs", fillable: false, extra: ["--fix"] }, { name: "write", script: "pb_write.mjs", fillable: true }] : []),
  { name: "verify", script: "pb_verify.mjs", fillable: true },
  { name: "graphics", script: "pb_graphics.mjs", fillable: true },
  { name: "layout", script: "pb_layout.mjs", fillable: false },
  { name: "render", script: "pb_render.mjs", fillable: false },
];

function stageDone(name) {
  try { const p = runPaths(process.env.PB_ID); const s = JSON.parse(fs.readFileSync(p.spine, "utf-8")); return !!s.stages?.[name === "edit" ? "verify" : name]; }
  catch { return false; }
}
function runPhase(ph) {
  const args = [path.join(__dirname, ph.script), ...(ph.extra || [])];
  const res = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  return res.status;
}

function main() {
  if (!process.env.PB_TOPIC && !process.env.PB_ID && !ID) { console.error("Set PB_TOPIC (first run) or PB_ID (resume)."); process.exit(1); }
  if (ID) process.env.PB_ID = ID;
  // research derives the id from the topic if PB_ID unset; capture it after research.

  let list = PHASES;
  if (ONLY) list = PHASES.filter((p) => p.name === ONLY);
  else if (FROM) { const i = PHASES.findIndex((p) => p.name === FROM); if (i >= 0) list = PHASES.slice(i); }

  const t0 = Date.now();
  for (const ph of list) {
    log(`\n================ PHASE: ${ph.name} ================`);
    const maxTries = ph.fillable ? 5 : 1;
    let ok = false;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const status = runPhase(ph);
      // after research, the id may have been derived from the topic — pick it up for later phases
      if (ph.name === "research" && !process.env.PB_ID) {
        // find the newest run dir
        try {
          const RUNS = runPaths("x").dir.replace(/x$/, "");
          const dirs = fs.readdirSync(RUNS).map((d) => ({ d, t: fs.statSync(path.join(RUNS, d)).mtimeMs })).sort((a, b) => b.t - a.t);
          if (dirs[0]) process.env.PB_ID = dirs[0].d;
        } catch { /* ignore */ }
      }
      if (status === 0 || stageDone(ph.name)) { ok = true; break; }
      if (ph.fillable) { log(`  (phase ${ph.name} incomplete — retry ${attempt}/${maxTries})`); continue; }
      break;
    }
    if (!ok) { console.error(`\n✗ phase ${ph.name} did not complete. Fix and re-run with --from=${ph.name}.`); process.exit(2); }
  }
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  const p = runPaths(process.env.PB_ID);
  log(`\n✅ Playbook complete in ${mins} min`);
  if (fs.existsSync(p.pdf)) log(`   PDF: ${p.pdf}`);
}
main();
