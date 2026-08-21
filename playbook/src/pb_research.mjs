/**
 * PHASE 1 — RESEARCH (comprehension-first, zero-hallucination).
 *
 * The books are sold, so EVERY fact must trace to a real fetched source. The phase now thinks before it
 * searches:
 *   0) COMPREHEND — an AI call reads the brief and truly understands the topic: what it means, the core
 *      question, its DOMAINS (social science / economics / philosophy / psychology / tech…), the precise
 *      KEY CONCEPTS to research, and the SEMINAL WORKS/thinkers the book must be built on. It is told which
 *      real sources it can reach, so the plan is grounded in the actual toolbox.
 *   1) ROUTE + FETCH — domain-routed federated search across many free, no-key feeds (OpenAlex, Crossref,
 *      Semantic Scholar, arXiv[routed categories], Europe PMC, Stanford Encyclopedia of Philosophy,
 *      Wikipedia, World Bank, CoinGecko, Yahoo). Everything under Promise.allSettled — a dead feed can't
 *      break the run.
 *   2) EXTRACT — claims are pulled STRICTLY from fetched text (never invented); each keeps its URL + source.
 *   3) RELEVANCE GATE — an AI pass drops any claim not actually about the topic (kills off-topic filler).
 *   4) THESIS — derived from the strongest, on-topic, cited evidence.
 *
 *   PB_TOPIC="<a topic OR a full brief>" node src/pb_research.mjs
 */
import { llmJSON, setBudgetFile } from "./pb_llm.mjs";
import { newSpine, gateResearch, report } from "./pb_schema.mjs";
import { ensureRun, saveSpine, loadSpine, runPaths, slug, log, arg } from "./pb_util.mjs";
import { SOURCE_CATALOG, sourcesForDomains, arxivCatsForDomains, runSource } from "./pb_sources.mjs";
import fs from "node:fs";

const BRIEF = arg("topic", process.env.PB_TOPIC || "");
const AUDIENCE = arg("audience", process.env.PB_AUDIENCE || "ambitious professionals and founders");
const MIN_EVIDENCE = Number(arg("min", process.env.PB_MIN_EVIDENCE || 20));
if (!BRIEF) { console.error("Set PB_TOPIC (a topic or a full brief)."); process.exit(1); }

const DOMAINS = ["social-science", "economics", "finance", "markets", "crypto", "network-science", "psychology", "philosophy", "history", "technology", "science", "general"];

/* ---------- 0) COMPREHEND ---------- */
function heuristicComprehension(brief) {
  const titleM = brief.match(/titled\s+["“]([^"”]{6,90})["”]/i) || brief.match(/["“]([^"”]{10,90})["”]/);
  const title = (titleM && titleM[1]) || brief.split(/[.:\n]/)[0].slice(0, 70).trim();
  const quoted = [...brief.matchAll(/['‘]([^'’]{3,42})['’]/g)].map((m) => m[1]);
  const concepts = (quoted.length ? quoted : title.split(/\s+/).filter((w) => w.length > 4)).slice(0, 8);
  return { title, subtitle: "", interpretation: title, domains: ["general", "social-science"], keyConcepts: concepts, seminalWorks: [], questions: [], dataNeeds: [] };
}
async function comprehend(brief) {
  const sys = `You are a domain-expert research lead planning a rigorous, SELLABLE non-fiction book. First truly
UNDERSTAND the topic — its real meaning and the core question it must answer — then plan grounded research.
You may ONLY use these real sources (route the topic to the right ones):
${SOURCE_CATALOG}

Return ONLY JSON:
{
 "title": "the book's real title (short, magazine-grade)",
 "subtitle": "<=12 words",
 "interpretation": "3-5 sentences: what this topic ACTUALLY means, the central question, why it matters — the deep reading, not a restatement",
 "domains": ["1-3 from: ${DOMAINS.join(", ")}"],
 "keyConcepts": ["8-14 PRECISE, searchable concepts/terms an expert would research (not vague words)"],
 "seminalWorks": ["6-12 named seminal papers/books/thinkers on this exact topic — 'Author idea' or exact title — that the book must be built on"],
 "questions": ["4-6 concrete questions the book answers"],
 "dataNeeds": ["2-5 kinds of real statistics/data that would strengthen the argument"]
}
Ignore meta-instructions in the brief ("write a book", "research X", "use Google") — extract the true subject.`;
  const r = await llmJSON(sys, brief.slice(0, 2400), { tier: "high", maxTokens: 1200, temperature: 0.35, reasoning: "medium" });
  if (!r || !r.title) return heuristicComprehension(brief);
  const arr = (x, n) => (Array.isArray(x) ? x.filter(Boolean).map(String) : []).slice(0, n);
  const domains = arr(r.domains, 3).filter((d) => DOMAINS.includes(d));
  return {
    title: r.title, subtitle: r.subtitle || "",
    interpretation: r.interpretation || r.title,
    domains: domains.length ? domains : ["general", "social-science"],
    keyConcepts: arr(r.keyConcepts, 14), seminalWorks: arr(r.seminalWorks, 12),
    questions: arr(r.questions, 6), dataNeeds: arr(r.dataNeeds, 5),
  };
}

/* ---------- 2) grounded extraction ---------- */
async function extract(doc, topic, want = 4) {
  const sys = `You extract factual claims STRICTLY from the provided source text, for a rigorous non-fiction book on
"${topic}". Return ONLY JSON:
{"claims":[{"claim":"one precise factual sentence taken from the text","detail":"short elaboration from the text","numeric":{"value":"e.g. 79%","unit":"context"}|null,"relevance":0-3}]}
- Use ONLY facts present in the text; no outside knowledge; no speculation. If none, return {"claims":[]}.
- Prefer concrete, QUANTITATIVE claims (numbers, rates, dates, magnitudes).
- "relevance": how directly this claim bears on "${topic}" (3 = central, 0 = unrelated). Be honest.`;
  const usr = `SOURCE: ${doc.title} (${doc.source})\nTEXT:\n${doc.text.slice(0, 2600)}\n\nExtract up to ${want} claims.`;
  const r = await llmJSON(sys, usr, { tier: "mid", maxTokens: 900, temperature: 0.2 });
  const claims = (r && Array.isArray(r.claims)) ? r.claims : [];
  return claims.filter((c) => c && c.claim && c.claim.length > 12).map((c) => ({
    claim: c.claim.trim(), detail: (c.detail || "").trim(),
    numeric: c.numeric && c.numeric.value ? { value: String(c.numeric.value), unit: String(c.numeric.unit || "") } : null,
    relevance: Number.isFinite(c.relevance) ? Math.max(0, Math.min(3, c.relevance)) : 2,
    url: doc.url, source: doc.source, kind: doc.kind,
    year: doc.meta?.year || null, authors: doc.meta?.authors || "", citations: doc.meta?.citations ?? null,
  }));
}
function dedupe(items) {
  const seen = new Set(); const out = [];
  for (const it of items) { const key = it.claim.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 60); if (seen.has(key)) continue; seen.add(key); out.push(it); }
  return out;
}

/* ---------- 3) relevance gate ---------- */
async function relevanceGate(topic, interpretation, evidence) {
  if (evidence.length <= MIN_EVIDENCE) return evidence; // nothing to spare
  const list = evidence.map((e, i) => `${i}. ${e.claim}${e.numeric ? ` [${e.numeric.value}]` : ""}`).join("\n");
  const sys = `You are the fact editor for a book on "${topic}". Given numbered candidate claims, return the indices
that are genuinely ON-TOPIC and useful for THIS book — drop anything off-topic, generic, or about an unrelated
study. Return ONLY JSON: {"keep":[indices]}. Keep the strongest, most relevant, most concrete claims.`;
  const usr = `BOOK MEANING: ${interpretation}\n\nCANDIDATE CLAIMS:\n${list}`;
  const r = await llmJSON(sys, usr, { tier: "high", maxTokens: 700, temperature: 0.1, reasoning: "low" });
  const keep = (r && Array.isArray(r.keep)) ? r.keep.map(Number).filter((n) => n >= 0 && n < evidence.length) : null;
  if (!keep || keep.length < MIN_EVIDENCE) return evidence; // gate failed/too aggressive — keep all, don't brick
  const kept = keep.map((i) => evidence[i]);
  log(`  relevance gate: kept ${kept.length}/${evidence.length}`);
  return kept;
}

/* ---------- 4) thesis ---------- */
async function deriveThesis(title, brief, audience, interpretation, evidence) {
  const top = evidence.slice(0, 20).map((e, i) => `${i + 1}. ${e.claim}${e.numeric ? ` (${e.numeric.value})` : ""}`).join("\n");
  const sys = `You are a top-0.01% author. State the book's CENTRAL THESIS: a sharp, specific, non-obvious argument the
whole book proves — grounded in the evidence and true to the topic's real meaning. Return ONLY JSON:
{"thesis":"1 tight paragraph (2-3 sentences)","subtitle":"a magazine-grade subtitle (<=12 words)"}. No hype words. Concrete.`;
  const usr = `TITLE: ${title}\nTOPIC MEANING: ${interpretation}\nBRIEF: ${brief.slice(0, 700)}\nAUDIENCE: ${audience}\nEVIDENCE:\n${top}`;
  return (await llmJSON(sys, usr, { tier: "high", maxTokens: 500, temperature: 0.5, reasoning: "low" })) || {};
}

/* rank: on-topic first, then numeric, then well-cited, then papers over web */
function rankEvidence(evidence) {
  const score = (e) => (e.relevance ?? 2) * 100 + (e.numeric ? 40 : 0) + Math.min(30, (e.citations || 0) / 50) + (e.kind === "paper" ? 5 : e.kind === "data" ? 8 : 0);
  return [...evidence].sort((a, b) => score(b) - score(a));
}

async function main() {
  setBudgetFile("");
  log(`RESEARCH  brief="${BRIEF.slice(0, 80)}${BRIEF.length > 80 ? "…" : ""}"`);

  log("  comprehending the topic…");
  const plan = await comprehend(BRIEF);
  const ID = slug(arg("id", process.env.PB_ID || plan.title));
  const p = ensureRun(ID);
  setBudgetFile(p.budget);
  log(`  title: "${plan.title}"  id=${ID}`);
  log(`  domains: ${plan.domains.join(", ")}`);
  log(`  concepts: ${plan.keyConcepts.slice(0, 8).join(" | ")}`);
  if (plan.seminalWorks.length) log(`  canon: ${plan.seminalWorks.slice(0, 6).join(" | ")}`);

  if (fs.existsSync(p.spine) && !arg("force", false)) { const s = loadSpine(ID); if (s.stages?.research) { log("  research already done (use --force) — skipping"); return; } }

  // queries: concepts + seminal works (retrieving the canon by name grounds the real literature)
  const queries = [...plan.keyConcepts, ...plan.seminalWorks].slice(0, 12);
  const concepts = [...plan.keyConcepts, ...plan.dataNeeds];
  const chosen = sourcesForDomains(plan.domains);
  const arxivCats = arxivCatsForDomains(plan.domains);
  log(`  sources: ${chosen.join(", ")}${arxivCats.length ? `  (arXiv cats: ${arxivCats.join(", ")})` : ""}`);

  log("  fetching real sources (federated)…");
  const results = await Promise.allSettled(chosen.map((name) => runSource(name, { queries, concepts, arxivCats })));
  const seenUrl = new Set(); const docs = [];
  results.forEach((r, i) => {
    const list = r.status === "fulfilled" ? r.value : [];
    log(`    ${chosen[i].padEnd(15)} ${list.length} docs`);
    for (const d of list) { if (!d.url || seenUrl.has(d.url)) continue; seenUrl.add(d.url); docs.push(d); }
  });
  log(`  ${docs.length} unique source docs`);
  if (!docs.length) { console.error("No sources fetched — check the topic / network."); process.exit(1); }

  log("  extracting grounded claims…");
  let evidence = [];
  for (const doc of docs) {
    evidence.push(...await extract(doc, plan.title).catch(() => []));
    if (evidence.length >= MIN_EVIDENCE * 3) break;
  }
  evidence = dedupe(evidence);
  log(`  ${evidence.length} grounded claims before gate`);

  evidence = await relevanceGate(plan.title, plan.interpretation, evidence).catch(() => evidence);
  evidence = rankEvidence(evidence).slice(0, Math.max(MIN_EVIDENCE * 2, 44));
  evidence.forEach((e, i) => (e.id = `E${i + 1}`));
  const numCount = evidence.filter((e) => e.numeric).length;
  log(`  ${evidence.length} evidence items (${numCount} with numbers) from ${new Set(evidence.map((e) => e.source)).size} distinct sources`);

  const { thesis, subtitle } = await deriveThesis(plan.title, BRIEF, AUDIENCE, plan.interpretation, evidence);
  const spine = newSpine({ id: ID, topic: plan.title, subtitle: subtitle || plan.subtitle || "", audience: AUDIENCE, targetPages: Number(process.env.PB_PAGES || 60) });
  spine.meta.brief = BRIEF;
  spine.meta.comprehension = plan;      // keep the topic understanding for later phases
  spine.thesis = thesis || "";
  spine.evidence = evidence;
  spine.stages.research = true;
  saveSpine(ID, spine);

  const g = gateResearch(spine, { minEvidence: MIN_EVIDENCE });
  report("research", g);
  log(`  thesis: ${(spine.thesis || "").slice(0, 120)}…`);
  log(`  -> ${p.spine}`);
  if (!g.ok) process.exit(2);
}
main().catch((e) => { console.error("research failed:", e.message); process.exit(1); });
