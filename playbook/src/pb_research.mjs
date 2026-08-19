/**
 * PHASE 1 — RESEARCH (no hallucination).
 *
 * Pulls REAL source text (arXiv abstracts + Wikipedia) for the topic, then uses the LLM only to EXTRACT
 * structured claims FROM that fetched text (never to invent). Every claim is stamped with the source URL,
 * forming the "evidence ledger" that later phases must cite ("citation-or-cut"). Finally it derives the
 * book's central thesis from the strongest evidence.
 *
 *   PB_ID=gnn PB_TOPIC="The Future of Graph Neural Networks" node src/pb_research.mjs
 */
import { llmJSON } from "./pb_llm.mjs";
import { newSpine, gateResearch, report } from "./pb_schema.mjs";
import { ensureRun, saveSpine, loadSpine, fetchText, stripHtml, slug, log, arg } from "./pb_util.mjs";
import { setBudgetFile } from "./pb_llm.mjs";
import fs from "node:fs";

const TOPIC = arg("topic", process.env.PB_TOPIC || "");
const ID = slug(arg("id", process.env.PB_ID || TOPIC));
const AUDIENCE = arg("audience", process.env.PB_AUDIENCE || "technical leaders and builders");
const MIN_EVIDENCE = Number(arg("min", process.env.PB_MIN_EVIDENCE || 16));

if (!TOPIC) { console.error("Set PB_TOPIC (the book subject)."); process.exit(1); }

/* ---------- real source collectors (keyless, free) ---------- */
async function arxiv(topic, n = 24) {
  const q = encodeURIComponent(topic.replace(/[^\w\s]/g, " ").trim());
  const url = `http://export.arxiv.org/api/query?search_query=all:${q}&sortBy=relevance&max_results=${n}`;
  const xml = await fetchText(url, { ms: 25000 }).catch(() => "");
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const g = (e, tag) => (e.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || "";
  return entries.map((e) => ({
    kind: "paper",
    title: stripHtml(g(e, "title")),
    url: (g(e, "id") || "").trim().replace("http:", "https:"),
    text: stripHtml(g(e, "summary")),
    source: "arXiv",
  })).filter((s) => s.text.length > 120);
}
async function wikipedia(topic) {
  const out = [];
  const title = topic.split(":")[0].trim();
  try {
    const j = JSON.parse(await fetchText(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { ms: 15000 }));
    if (j.extract) out.push({ kind: "web", title: j.title || title, url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, text: stripHtml(j.extract), source: "Wikipedia" });
  } catch { /* optional */ }
  try {
    const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    const j = JSON.parse(await fetchText(api, { ms: 20000 }));
    const pages = j.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const t = stripHtml(pages[k].extract || "");
      if (t.length > 400) out.push({ kind: "web", title: pages[k].title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[k].title)}`, text: t.slice(0, 6000), source: "Wikipedia" });
    }
  } catch { /* optional */ }
  return out;
}

/* ---------- LLM extraction (grounded strictly in fetched text) ---------- */
async function extract(doc, want = 4) {
  const sys = `You extract factual claims STRICTLY from the provided source text for a rigorous non-fiction book.
Return ONLY JSON: {"claims":[{"claim": "one precise factual sentence taken from the text","detail":"a short supporting elaboration from the text","numeric":{"value":"e.g. 79%","unit":"context"}|null}]}.
HARD RULES: use ONLY facts present in the text; do NOT add outside knowledge; do NOT speculate. If the text
has no hard facts, return {"claims":[]}. Prefer concrete, specific, quantitative claims.`;
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
  for (const it of items) {
    const key = it.claim.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 60);
    if (seen.has(key)) continue; seen.add(key); out.push(it);
  }
  return out;
}

async function deriveThesis(topic, audience, evidence) {
  const top = evidence.slice(0, 18).map((e, i) => `${i + 1}. ${e.claim}${e.numeric ? ` (${e.numeric.value})` : ""}`).join("\n");
  const sys = `You are a top-0.01% author. Given real evidence, state the book's CENTRAL THESIS: a sharp, specific,
non-obvious argument the whole book will prove — not a summary. Return ONLY JSON:
{"thesis":"1 tight paragraph (2-3 sentences)","subtitle":"a magazine-grade subtitle (<=12 words)"}.
No hype words ("game-changer","revolutionary","the future of"). Be concrete.`;
  const usr = `TOPIC: ${topic}\nAUDIENCE: ${audience}\nEVIDENCE:\n${top}`;
  return (await llmJSON(sys, usr, { tier: "high", maxTokens: 500, temperature: 0.5 })) || {};
}

async function main() {
  const p = ensureRun(ID);
  setBudgetFile(p.budget);
  log(`RESEARCH  id=${ID}  topic="${TOPIC}"`);

  // resume: if a Spine already has research, keep it unless --force
  if (fs.existsSync(p.spine) && !arg("force", false)) {
    const s = loadSpine(ID);
    if (s.stages?.research) { log("  research already done (use --force to redo) — skipping"); return; }
  }

  log("  fetching real sources (arXiv + Wikipedia)…");
  const [papers, wiki] = await Promise.all([arxiv(TOPIC).catch(() => []), wikipedia(TOPIC).catch(() => [])]);
  const docs = [...papers, ...wiki];
  log(`  ${papers.length} papers, ${wiki.length} wiki docs`);
  if (!docs.length) { console.error("No sources fetched — check the topic / network."); process.exit(1); }

  log("  extracting grounded claims…");
  let evidence = [];
  for (const doc of docs) {
    const claims = await extract(doc).catch(() => []);
    evidence.push(...claims);
    if (evidence.length >= MIN_EVIDENCE * 2) break; // enough raw material
  }
  evidence = dedupe(evidence).slice(0, Math.max(MIN_EVIDENCE * 2, 40));
  evidence.forEach((e, i) => (e.id = `E${i + 1}`));
  log(`  ${evidence.length} grounded evidence items`);

  const { thesis, subtitle } = await deriveThesis(TOPIC, AUDIENCE, evidence);

  const spine = newSpine({ id: ID, topic: TOPIC, subtitle: subtitle || "", audience: AUDIENCE, targetPages: Number(process.env.PB_PAGES || 60) });
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
