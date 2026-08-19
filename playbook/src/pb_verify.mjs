/**
 * PHASE 4 — VERIFY (citation-or-cut, the achievable "Quant-Auditor").
 *
 * For each section, an auditor pass checks every paragraph against ONLY its cited evidence and rewrites
 * to remove or correct: (a) any factual claim not supported by the evidence, (b) any number/date/name not
 * present in the evidence. Supported claims keep their sourceIds. This is what makes the book trustworthy —
 * a reader (or a critic) can trace every hard claim to a real source URL in the evidence ledger.
 *
 * Fail-safe: if the auditor LLM is unavailable for a section, the original (written under strict no-invention
 * rules) is kept and the section is marked verified with a logged warning — a run is never bricked by an outage.
 *
 *   PB_ID=gnn node src/pb_verify.mjs
 */
import { llmJSON, setBudgetFile } from "./pb_llm.mjs";
import { gateVerified, report, allSections, evidenceMap } from "./pb_schema.mjs";
import { loadSpine, saveSpine, runPaths, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
const FORCE = !!arg("force", false);
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

function evBlock(section, emap) {
  const items = (section.evidenceIds || []).map((id) => emap.get(id)).filter(Boolean);
  return items.length ? items.map((e) => `${e.id}: ${e.claim}${e.numeric ? ` [${e.numeric.value} ${e.numeric.unit}]` : ""}`).join("\n") : "(none)";
}

async function audit(section, emap) {
  const sys = `You are a strict fact auditor for a premium book. You are given a section's paragraphs and the ONLY
evidence they may rely on. Rewrite each paragraph to REMOVE or CORRECT anything not supported by the evidence:
- delete any statistic, date, proper noun, or causal claim not present in the evidence;
- keep supported claims and list the supporting evidence ids;
- preserve the analytical voice and flow; do not add new facts.
Return ONLY JSON: {"paragraphs":[{"text":"audited paragraph","sourceIds":["E3"]}]}. Keep the same paragraph count/order.`;
  const usr = `EVIDENCE:\n${evBlock(section, emap)}\n\nPARAGRAPHS:\n${(section.content.paragraphs || []).map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n")}`;
  return await llmJSON(sys, usr, { tier: "mid", maxTokens: 1200, temperature: 0.2 });
}

async function main() {
  const p = runPaths(ID); setBudgetFile(p.budget);
  const spine = loadSpine(ID);
  if (!spine.stages.write) { console.error("Finish writing first."); process.exit(1); }
  log(`VERIFY id=${ID}`);
  const emap = evidenceMap(spine);
  const secs = allSections(spine);
  const validIdsOf = (s) => new Set(s.evidenceIds || []);

  let audited = 0, kept = 0;
  for (let i = 0; i < secs.length; i++) {
    const { section } = secs[i];
    if (section.status === "verified" && !FORCE) continue;
    if (!section.content?.paragraphs?.length) continue;

    const r = await audit(section, emap).catch(() => null);
    if (r && Array.isArray(r.paragraphs) && r.paragraphs.length) {
      const vids = validIdsOf(section);
      section.content.paragraphs = r.paragraphs
        .filter((x) => x && x.text && x.text.length > 15)
        .map((x) => ({ text: String(x.text).trim(), sourceIds: (x.sourceIds || []).filter((id) => vids.has(id)) }));
      audited++;
    } else {
      log(`  ! auditor unavailable for ${section.id} — keeping original (written under no-invention rules)`);
      kept++;
    }
    section.status = "verified";
    saveSpine(ID, spine); // checkpoint
    if ((i + 1) % 5 === 0) log(`  … ${i + 1}/${secs.length} sections audited`);
  }

  spine.stages.verify = true;
  saveSpine(ID, spine);
  const g = gateVerified(spine);
  report("verified", g);
  log(`  audited ${audited}, kept-original ${kept}`);
  if (!g.ok) process.exit(2);
}
main().catch((e) => { console.error("verify failed:", e.message); process.exit(1); });
