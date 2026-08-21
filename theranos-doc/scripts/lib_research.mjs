/**
 * RESEARCH AGENT (free, no API keys beyond Groq): before writing a script, gather real facts.
 *
 *   1) Query expansion — Groq breaks the topic into 3-4 focused, factual sub-questions.
 *   2) Multi-source search — for each sub-question, pull snippets from Wikipedia + DuckDuckGo
 *      (+ Hacker News for tech niches), in parallel.
 *   3) Dedupe + synthesize into a compact brief the script writer is grounded on.
 *
 * Every network step has a timeout and is best-effort: if a source (or all of them) fails, research
 * degrades gracefully and generation still proceeds. Returns { items:[{title,extract,url}], brief }.
 */

import { groqJSON } from "./lib_groq.mjs";

async function fetchJSON(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function fetchText(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ---------- 1) query expansion ---------- */
async function subQuestions(topic, niche) {
  const j = await groqJSON(
    `You are a research assistant for a ${niche} video. Break the topic into 3-4 focused, factual sub-questions worth researching before writing. Return JSON {"questions": string[]} only.`,
    `TOPIC: ${topic}`,
    { maxTokens: 400, temperature: 0.3 },
  );
  if (!j) return [];
  return (j.questions || []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

/* ---------- 2) sources ---------- */
async function wikipedia(q) {
  const s = await fetchJSON(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*`,
  );
  const hits = (s?.query?.search || []).slice(0, 2);
  const out = [];
  for (const h of hits) {
    const d = await fetchJSON(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
    );
    if (d?.extract) out.push({ src: "wiki", title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page || "" });
  }
  return out;
}

async function duckduckgo(q) {
  const j = await fetchJSON(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
  );
  if (!j) return [];
  const out = [];
  if (j.AbstractText) out.push({ src: "ddg", title: j.Heading || q, extract: j.AbstractText, url: j.AbstractURL || "" });
  for (const rt of (j.RelatedTopics || []).slice(0, 3)) {
    if (rt?.Text) out.push({ src: "ddg", title: "", extract: rt.Text, url: rt.FirstURL || "" });
  }
  return out;
}

async function hackernews(q) {
  const j = await fetchJSON(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=3`,
  );
  return (j?.hits || [])
    .filter((h) => h.title)
    .map((h) => ({ src: "hn", title: h.title, extract: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}` }));
}

// AUTHORITATIVE / ACADEMIC sources — these are what stop the "confident but made-up" problem: real
// peer-reviewed papers with abstracts we can ground on, not blog snippets. Both free & keyless.

// arXiv (physics/CS/AI/robotics preprints). Atom XML — light regex parse of <entry> blocks.
async function arxiv(q) {
  const xml = await fetchText(
    `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=3&sortBy=relevance`,
  );
  if (!xml) return [];
  const un = (s) => String(s || "").replace(/\s+/g, " ").trim();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const b = m[1];
    const title = un((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const summary = un((b.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]);
    const url = un((b.match(/<id>([\s\S]*?)<\/id>/) || [])[1]);
    return title && summary ? { src: "arxiv", title, extract: summary.slice(0, 600), url } : null;
  }).filter(Boolean);
}

// Semantic Scholar (all fields incl. economics/finance) — clean abstracts, one JSON call.
async function semanticScholar(q) {
  const j = await fetchJSON(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=3&fields=title,abstract,year,url,externalIds`,
  );
  return (j?.data || [])
    .filter((p) => p.title && p.abstract)
    .map((p) => ({
      src: "s2",
      title: `${p.title}${p.year ? ` (${p.year})` : ""}`,
      extract: String(p.abstract).slice(0, 600),
      url: p.url || (p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : ""),
    }));
}

/* ---------- main ---------- */
export async function research(topic, opts = {}) {
  const niche = opts.niche || "";
  const wantTech = /deeptech|robotics|^ai$|ai|space|science/i.test(niche);
  // Academic sources: arXiv for tech/science, Semantic Scholar for everything (it covers econ/finance
  // too). These are the authoritative backbone that keeps claims real.
  const wantArxiv = wantTech;
  const wantPapers = /deeptech|robotics|ai|science|space|finance|business/i.test(niche);

  let queries = await subQuestions(topic, niche);
  if (queries.length < 2) queries = [topic, `what is ${topic}`, `${topic} explained`];
  queries = queries.slice(0, 4);

  // Topic keywords (stemmed to a 5-char prefix) for scoring how on-topic each snippet is.
  const STOP = new Set("how why what when where the a an of to in on for with is are was and or its into about".split(" "));
  const topicKw = String(topic).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/s$/, "").slice(0, 5));
  const relevance = (it) => {
    const text = `${it.title} ${it.title} ${it.extract}`.toLowerCase();
    return topicKw.reduce((n, w) => n + (w && text.includes(w) ? 1 : 0), 0);
  };

  // Only the first two sub-questions hit the (slower, rate-limited) academic APIs — keeps latency down
  // while still grounding on real papers.
  const buckets = await Promise.all(
    queries.map(async (q, qi) => {
      const academic = qi < 2;
      const [w, d, h, a, s] = await Promise.all([
        wikipedia(q),
        duckduckgo(q),
        wantTech ? hackernews(q) : Promise.resolve([]),
        academic && wantArxiv ? arxiv(q) : Promise.resolve([]),
        academic && wantPapers ? semanticScholar(q) : Promise.resolve([]),
      ]);
      return [...a, ...s, ...w, ...d, ...h];
    }),
  );

  const seen = new Set();
  let items = [];
  for (const it of buckets.flat()) {
    const text = String(it.extract || "").trim();
    if (text.length < 25) continue; // drop empty / too-thin snippets
    const key = text.slice(0, 90).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ src: it.src || "", title: it.title || "", extract: text, url: it.url || "" });
  }

  // Rank by on-topic relevance, with an authority bonus so peer-reviewed papers outrank blog snippets.
  // If topic-scoring nukes everything (thin topic), fall back to the raw top few rather than nothing.
  const AUTH = { arxiv: 3, s2: 3, wiki: 1, ddg: 0, hn: 0 };
  const scored = items.map((it) => ({ it, r: relevance(it) + (AUTH[it.src] || 0) })).sort((a, b) => b.r - a.r);
  const onTopic = scored.filter((x) => x.r >= 1).map((x) => x.it);
  items = (onTopic.length >= 3 ? onTopic : items).slice(0, 12);

  const brief = items.map((it) => `- ${it.title ? it.title + ": " : ""}${it.extract}`).join("\n").slice(0, 3000);
  return { items, brief, queries };
}
