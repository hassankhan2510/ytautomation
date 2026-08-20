/**
 * PHASE 2 — ARCHITECT (the Memory Graph / outline).
 *
 * Builds the book's full structure BEFORE a word of prose is written, so the 60-page run can never
 * "forget" itself. Two steps (map-reduce, so nothing exceeds the token window):
 *   A) chapter skeleton   — 5-8 chapters (title + purpose) that together prove the thesis.
 *   B) per-chapter sections — each section gets a thesis, the real evidence ids it will use, and —
 *      graphic-first — the ONE visual that proves its point (chosen from the primitive library).
 *
 *   PB_ID=gnn node src/pb_architect.mjs
 */
import { llmJSON, setBudgetFile } from "./pb_llm.mjs";
import { gateOutline, report, VISUAL_KINDS, allSections } from "./pb_schema.mjs";
import { loadSpine, saveSpine, runPaths, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

function ledgerText(evidence) {
  return evidence.map((e) => `${e.id}: ${e.claim}${e.numeric ? ` [${e.numeric.value}]` : ""}`).join("\n");
}

async function skeleton(spine, nChapters) {
  const sys = `You are the chief architect of a top-1% non-fiction book (think McKinsey report crossed with a
best-selling science author). Design the CHAPTER skeleton that proves the thesis with a clear arc
(setup -> mechanism -> evidence -> implications -> action). Return ONLY JSON:
{"chapters":[{"title":"specific, magazine-grade","summary":"2 sentences: what this chapter proves and why it belongs here"}]}.
Exactly ${nChapters} chapters. No generic titles ("Introduction","Conclusion" are OK only if truly earned).`;
  const usr = `TOPIC: ${spine.meta.topic}\nAUDIENCE: ${spine.meta.audience}\nTHESIS: ${spine.thesis}\nEVIDENCE (ids you can draw on):\n${ledgerText(spine.evidence)}`;
  const r = await llmJSON(sys, usr, { tier: "high", maxTokens: 1400, temperature: 0.55, reasoning: "medium" });
  return (r && Array.isArray(r.chapters)) ? r.chapters : [];
}

async function sectionsFor(spine, chapter, nSections) {
  const sys = `You design the SECTIONS of one chapter of a top-1% book. For EACH section return: a specific title,
a one-sentence thesis (the point it proves), the evidence ids it will cite (from the ledger), and —
GRAPHIC-FIRST — the single best visual that proves the point.
Return ONLY JSON: {"sections":[{
  "title": "...",
  "thesis": "one sentence",
  "evidenceIds": ["E3","E7"],
  "visual": {"kind": one of ${JSON.stringify(VISUAL_KINDS)},
             "title": "figure title",
             "dataHint": "what the visual should show, in plain words (the graphics stage builds it from evidence)"}
}]}.
RULES: exactly ${nSections} sections. VARY the visual kinds across sections (not all charts). Use "chart",
"bigstat","statgrid","table" only when there is a real NUMBER in the cited evidence; otherwise use "diagram",
"flow","timeline","matrix","conceptmap","compare" or "quote". Only cite evidence ids that exist.`;
  const usr = `BOOK THESIS: ${spine.thesis}\nCHAPTER: ${chapter.title}\nCHAPTER PURPOSE: ${chapter.summary}\nEVIDENCE LEDGER:\n${ledgerText(spine.evidence)}`;
  const r = await llmJSON(sys, usr, { tier: "high", maxTokens: 1800, temperature: 0.5, reasoning: "medium" });
  return (r && Array.isArray(r.sections)) ? r.sections : [];
}

async function main() {
  const p = runPaths(ID); setBudgetFile(p.budget);
  const spine = loadSpine(ID);
  if (!spine.stages.research) { console.error("Run research first."); process.exit(1); }
  if (spine.stages.architect && !arg("force", false)) { log("architect already done (use --force) — skipping"); return; }
  log(`ARCHITECT id=${ID}`);

  const targetSections = Math.max(18, Math.round((spine.meta.targetPages || 60) / 2.2));
  const nChapters = Math.min(8, Math.max(5, Math.round(targetSections / 4)));
  const perChapter = Math.max(3, Math.round(targetSections / nChapters));
  log(`  planning ${nChapters} chapters × ~${perChapter} sections (~${targetSections} sections)`);

  const chs = await skeleton(spine, nChapters);
  if (chs.length < 3) { console.error("architect: skeleton too small (LLM unavailable?)."); process.exit(2); }

  const evIds = new Set(spine.evidence.map((e) => e.id));
  const chapters = [];
  let cN = 0, sN = 0;
  for (const ch of chs) {
    cN++;
    const secsRaw = await sectionsFor(spine, ch, perChapter);
    const sections = [];
    for (const s of secsRaw) {
      if (!s.title || !s.thesis) continue;
      sN++;
      const kind = VISUAL_KINDS.includes(s.visual?.kind) ? s.visual.kind : "diagram";
      const eids = (s.evidenceIds || []).filter((id) => evIds.has(id));
      sections.push({
        id: `S${sN}`, title: String(s.title).trim(), thesis: String(s.thesis).trim(),
        evidenceIds: eids,
        visual: { kind, title: String(s.visual?.title || s.title).trim(), dataHint: String(s.visual?.dataHint || "").trim(), spec: null, evidenceIds: eids },
        content: null, template: null, status: "planned",
      });
    }
    if (sections.length) chapters.push({ id: `C${cN}`, title: String(ch.title).trim(), summary: String(ch.summary || "").trim(), sections });
    log(`  ch ${cN}/${chs.length}: "${ch.title}" — ${sections.length} sections`);
  }

  spine.outline = { chapters };
  spine.stages.architect = true;
  saveSpine(ID, spine);

  const g = gateOutline(spine, { minChapters: 5, minSections: 16 });
  report("outline", g);
  log(`  total: ${chapters.length} chapters, ${allSections(spine).length} sections`);
  if (!g.ok) process.exit(2);
}
main().catch((e) => { console.error("architect failed:", e.message); process.exit(1); });
