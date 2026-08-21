/**
 * PHASE 3 — WRITE (Groq map-reduce).
 *
 * Writes ONE section at a time from a tight "context packet" (book thesis + chapter purpose + this
 * section's thesis + its cited evidence + the neighbouring sections' theses for flow). Because each call
 * is small and grounded, quality stays top-1% and the book never drifts. Every paragraph records the
 * evidence ids it draws on (paragraph-level sourcing) so the next phase can enforce citation-or-cut.
 *
 * Checkpoints after EVERY section -> a crashed/rate-limited 2-hour run resumes exactly where it stopped.
 *
 *   PB_ID=gnn node src/pb_write.mjs            # writes only the not-yet-written sections
 *   PB_ID=gnn node src/pb_write.mjs --force    # rewrite all
 */
import { llmJSON, setBudgetFile } from "./pb_llm.mjs";
import { gateWritten, report, allSections, evidenceMap } from "./pb_schema.mjs";
import { loadSpine, saveSpine, runPaths, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
const FORCE = !!arg("force", false);
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

function evidenceBlock(section, emap) {
  const items = (section.evidenceIds || []).map((id) => emap.get(id)).filter(Boolean);
  if (!items.length) return "(no specific evidence assigned — write analytically, make NO invented facts/numbers)";
  return items.map((e) => `${e.id}: ${e.claim}${e.detail ? " — " + e.detail : ""}${e.numeric ? ` [${e.numeric.value} ${e.numeric.unit}]` : ""} (src: ${e.source})`).join("\n");
}

async function writeSection(spine, chapter, section, prev, next, emap) {
  const sys = `You are a top-0.01% non-fiction author (clarity of Steven Pinker, rigor of an equity research desk).
Write ONE section of a premium playbook. Return ONLY JSON:
{"paragraphs":[{"text":"a tight paragraph","sourceIds":["E3"]}],"pullQuote":"one quotable sentence (<=18 words)"}.
RULES:
- 4-6 paragraphs, ~90-140 words each — real depth and argument, not a summary. Concrete, specific, zero filler,
  no hype words, no clichés. Develop the idea: state it, show the mechanism, ground it in the evidence, draw the implication.
- Any sentence stating a FACT or NUMBER must be supported by the cited evidence; put those evidence ids in
  that paragraph's sourceIds. NEVER invent a fact, statistic, date, or name not in the evidence.
- A purely analytical/transitional paragraph may have "sourceIds":[] — but then it must contain no new facts.
- NEVER write evidence ids like "(E3)" or "(E21)" inside the prose — ids go ONLY in each paragraph's sourceIds array. The visible text must read like a finished book, with no citation codes.
- Write so it flows from the previous section and sets up the next; do not repeat their points.
- Address the reader as a smart practitioner. British/US neutral. No emojis, no headings inside the text.`;
  const usr = `BOOK THESIS: ${spine.thesis}
CHAPTER: ${chapter.title} — ${chapter.summary}
THIS SECTION: ${section.title}
SECTION THESIS: ${section.thesis}
PREVIOUS SECTION: ${prev ? prev.title + " — " + prev.thesis : "(this is the first section)"}
NEXT SECTION: ${next ? next.title + " — " + next.thesis : "(this is the last section)"}
EVIDENCE YOU MAY CITE:
${evidenceBlock(section, emap)}`;
  // 2600 + light reasoning gives room for both the model's thinking AND 4-6 fuller paragraphs of JSON
  // (pb_llm auto-raises the ceiling further if a section still comes back empty).
  return await llmJSON(sys, usr, { tier: "high", maxTokens: 2600, temperature: 0.62, reasoning: "low" });
}

async function main() {
  const p = runPaths(ID); setBudgetFile(p.budget);
  const spine = loadSpine(ID);
  if (!spine.stages.architect) { console.error("Run architect first."); process.exit(1); }
  log(`WRITE id=${ID}`);
  const emap = evidenceMap(spine);
  const secs = allSections(spine);

  let done = 0, wrote = 0;
  for (let i = 0; i < secs.length; i++) {
    const { chapter, section } = secs[i];
    if (section.content?.paragraphs?.length && !FORCE) { done++; continue; }
    const prev = secs[i - 1]?.section, next = secs[i + 1]?.section;
    const r = await writeSection(spine, chapter, section, prev, next, emap).catch(() => null);
    const paras = (r && Array.isArray(r.paragraphs)) ? r.paragraphs.filter((x) => x && x.text && x.text.length > 20) : [];
    if (!paras.length) { log(`  ! section ${section.id} "${section.title}" — write failed, will retry on next run`); continue; }
    const validIds = new Set(section.evidenceIds || []);
    section.content = {
      paragraphs: paras.map((x) => ({ text: String(x.text).trim(), sourceIds: (x.sourceIds || []).filter((id) => validIds.has(id)) })),
      pullQuote: (r.pullQuote || "").trim(),
    };
    section.status = "written";
    wrote++;
    saveSpine(ID, spine); // checkpoint after EVERY section
    log(`  ✓ ${section.id} (${i + 1}/${secs.length}) "${section.title}" — ${paras.length} paras`);
  }

  const stillEmpty = allSections(spine).filter((x) => !x.section.content?.paragraphs?.length).length;
  if (stillEmpty === 0) spine.stages.write = true;
  saveSpine(ID, spine);

  const g = gateWritten(spine);
  report("written", g);
  log(`  wrote ${wrote}, already had ${done}, still empty ${stillEmpty}`);
  if (stillEmpty) { log("  (re-run to fill the remaining sections)"); process.exit(2); }
}
main().catch((e) => { console.error("write failed:", e.message); process.exit(1); });
