/**
 * PHASE 1 — RESEARCH (no hallucination).
 *
 * 0) PLAN — turn the raw brief into a clean book TITLE + targeted SEARCH QUERIES + WIKI TOPICS, so the
 *    fetchers pull ON-TOPIC sources (feeding the whole brief to arXiv matched physics papers before).
 * 1) FETCH — real source text from arXiv (per query) + Wikipedia (per topic).
 * 2) EXTRACT — the LLM only pulls claims FROM the fetched text (never invents). Each claim keeps its URL.
 * 3) THESIS — derive the book's central thesis from the strongest evidence (aligned to the brief's intent).
 *
 *   PB_TOPIC="<a topic OR a full brief>" node src/pb_research.mjs
 */
import { llmJSON, setBudgetFile } from "./pb_llm.mjs";
import { newSpine, gateResearch, report } from "./pb_schema.mjs";
import { ensureRun, saveSpine, loadSpine, runPaths, fetchText, stripHtml, slug, log, arg } from "./pb_util.mjs";
import fs from "node:fs";

const BRIEF = arg("topic", process.env.PB_TOPIC || "");
const AUDIENCE = arg("audience", process.env.PB_AUDIENCE || "ambitious professionals and founders");
const MIN_EVIDENCE = Number(arg("min", process.env.PB_MIN_EVIDENCE || 16));
if (!BRIEF) { console.error("Set PB_TOPIC (a topic or a full brief)."); process.exit(1); }

/* ---------- 0) planner ---------- */
function heuristicPlan(brief) {
  const titleM = brief.match(/titled\s+["“]([^"”]{6,90})["”]/i) || brief.match(/["“]([^"”]{10,90})["”]/);
  const quoted = [...brief.matchAll(/['‘]([^'’]{3,42})['’]/g)].map((m) => m[1]);
  const title = (titleM && titleM[1]) || brief.split(/[.:\n]/)[0].slice(0, 70).trim();
  const queries = (quoted.length ? quoted : title.split(/\s+/).filter((w) => w.length > 4)).slice(0, 5);
  return { title, subtitle: "", queries: queries.length ? queries : [title], wikiTopics: queries.slice(0, 3) };
}
async function planTopic(brief) {
  const sys = `You turn a book brief into a research plan. Return ONLY JSON:
{"title":"the book's real title (short, magazine-grade)","subtitle":"<=12 words","queries":["4-6 precise search queries for academic + reference sources — the CONCEPTS to research, not the meta-instruction"],"wikiTopics":["2-4 Wikipedia article titles that ground the concepts"]}.
Extract the true subject; ignore meta-words like "write a book"/"research"/"use Google".`;
  const r = await llmJSON(sys, brief.slice(0, 2000), { tier: "mid", maxTokens: 500, temperature: 0.3 });
  if (!r || !Array.isArray(r.queries) || !r.queries.length) return heuristicPlan(brief);
  return {
    title: r.title || heuristicPlan(brief).title,
    subtitle: r.subtitle || "",
    queries: r.queries.slice(0, 6),
    wikiTopics: (Array.isArray(r.wikiTopics) && r.wikiTopics.length ? r.wikiTopics : r.queries).slice(0, 4),
  };
}

/* ---------- 1) real source collectors ---------- */
async function arxiv(query, n = 10) {
  const q = encodeURIComponent(query.replace(/[^\w\s]/g, " ").trim());
  const url = `http://export.arxiv.org/api/query?search_query=all:${q}&sortBy=relevance&max_results=${n}`;
  const xml = await fetchText(url, { ms: 25000 }).catch(() => "");
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const g = (e, tag) => (e.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || "";
  return entries.map((e) => ({ kind: "paper", title: stripHtml(g(e, "title")), url: (g(e, "id") || "").trim().replace("http:", "https:"), text: stripHtml(g(e, "summary")), source: "arXiv" })).filter((s) => s.text.length > 120);
}
async function wikipedia(title) {
  const out = [];
  try {
    const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    const j = JSON.parse(await fetchText(api, { ms: 20000 }));
    const pages = j.query?.pages || {};
    for (const k of Object.keys(pages)) { const t = stripHtml(pages[k].extract || ""); if (t.length > 400) out.push({ kind: "web", title: pages[k].title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[k].title)}`, text: t.slice(0, 6000), source: "Wikipedia" }); }
  } catch { /* optional */ }
  return out;
}

/* ---------- 2) grounded extraction ---------- */
async function extract(doc, want = 4) {
  const sys = `You extract factual claims STRICTLY from the provided source text for a rigorous non-fiction book.
Return ONLY JSON: {"claims":[{"claim":"one precise factual sentence from the text","detail":"short elaboration from the text","numeric":{"value":"e.g. 79%","unit":"context"}|null}]}.
Use ONLY facts present in the text; no outside knowledge; no speculation. If none, return {"claims":[]}. Prefer concrete, quantitative claims.`;
  const usr = `SOURCE: ${doc.title} (${doc.source})\nTEXT:\n${doc.text.slice(0, 2600)}\n\nExtract up to ${want} claims.`;
  const r = await llmJSON(sys, usr, { tier: "fast", maxTokens: 900, temperature: 0.2 });
  const claims = (r && Array.isArray(r.claims)) ? r.claims : [];
  return claims.filter((c) => c && c.claim && c.claim.length > 12).map((c) => ({
    claim: c.claim.trim(), detail: (c.detail || "").trim(),
    numeric: c.numeric && c.numeric.value ? { value: String(c.numeric.value), unit: String(c.numeric.unit || "") } : null,
    url: doc.url, source: doc.source, kind: doc.kind,
  }));
}
function dedupe(items) {
  const seen = new Set(); const out = [];
  for (const it of items) { const key = it.claim.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 60); if (seen.has(key)) continue; seen.add(key); out.push(it); }
  return out;
}

/* ---------- 3) thesis ---------- */
async function deriveThesis(title, brief, audience, evidence) {
  const top = evidence.slice(0, 18).map((e, i) => `${i + 1}. ${e.claim}${e.numeric ? ` (${e.numeric.value})` : ""}`).join("\n");
  const sys = `You are a top-0.01% author. State the book's CENTRAL THESIS: a sharp, specific, non-obvious argument the
whole book proves — grounded in the evidence, aligned to the brief's intent. Return ONLY JSON:
{"thesis":"1 tight paragraph (2-3 sentences)","subtitle":"a magazine-grade subtitle (<=12 words)"}. No hype words. Be concrete.`;
  const usr = `TITLE: ${title}\nBRIEF: ${brief.slice(0, 900)}\nAUDIENCE: ${audience}\nEVIDENCE:\n${top}`;
  return (await llmJSON(sys, usr, { tier: "high", maxTokens: 500, temperature: 0.5 })) || {};
}

async function main() {
  // budget file needs the run dir, but the id comes from the planned title — use a temp budget path first.
  setBudgetFile("");
  log(`RESEARCH  brief="${BRIEF.slice(0, 80)}${BRIEF.length > 80 ? "…" : ""}"`);

  log("  planning title + search queries…");
  const plan = await planTopic(BRIEF);
  const ID = slug(arg("id", process.env.PB_ID || plan.title));
  const p = ensureRun(ID);
  setBudgetFile(p.budget);
  log(`  title: "${plan.title}"  id=${ID}`);
  log(`  queries: ${plan.queries.join(" | ")}`);

  if (fs.existsSync(p.spine) && !arg("force", false)) { const s = loadSpine(ID); if (s.stages?.research) { log("  research already done (use --force) — skipping"); return; } }

  log("  fetching real sources (arXiv + Wikipedia)…");
  const docLists = await Promise.all([
    ...plan.queries.map((q) => arxiv(q, 8).catch(() => [])),
    ...plan.wikiTopics.map((t) => wikipedia(t).catch(() => [])),
  ]);
  // interleave + dedupe by url so no single query dominates
  const seenUrl = new Set(); const docs = [];
  for (const list of docLists) for (const d of list) { if (seenUrl.has(d.url)) continue; seenUrl.add(d.url); docs.push(d); }
  log(`  ${docs.length} unique source docs`);
  if (!docs.length) { console.error("No sources fetched — check the topic / network."); process.exit(1); }

  log("  extracting grounded claims…");
  let evidence = [];
  for (const doc of docs) { evidence.push(...await extract(doc).catch(() => [])); if (evidence.length >= MIN_EVIDENCE * 2) break; }
  evidence = dedupe(evidence).slice(0, Math.max(MIN_EVIDENCE * 2, 40));
  evidence.forEach((e, i) => (e.id = `E${i + 1}`));
  log(`  ${evidence.length} grounded evidence items`);

  const { thesis, subtitle } = await deriveThesis(plan.title, BRIEF, AUDIENCE, evidence);
  const spine = newSpine({ id: ID, topic: plan.title, subtitle: subtitle || plan.subtitle || "", audience: AUDIENCE, targetPages: Number(process.env.PB_PAGES || 60) });
  spine.meta.brief = BRIEF;
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
