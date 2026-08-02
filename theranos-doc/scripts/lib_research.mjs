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

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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

/* ---------- 1) query expansion ---------- */
async function subQuestions(topic, niche) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a research assistant for a ${niche} video. Break the topic into 3-4 focused, factual sub-questions worth researching before writing. Return JSON {"questions": string[]} only.`,
          },
          { role: "user", content: `TOPIC: ${topic}` },
        ],
      }),
    });
    if (!res.ok) return [];
    const d = await res.json();
    const j = JSON.parse(d.choices?.[0]?.message?.content || "{}");
    return (j.questions || []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  } catch {
    return [];
  }
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

/* ---------- main ---------- */
export async function research(topic, opts = {}) {
  const niche = opts.niche || "";
  const wantTech = /deeptech|robotics|^ai$|space|science/i.test(niche);

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

  const buckets = await Promise.all(
    queries.map(async (q) => {
      const [w, d, h] = await Promise.all([wikipedia(q), duckduckgo(q), wantTech ? hackernews(q) : Promise.resolve([])]);
      return [...w, ...d, ...h];
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
    items.push({ title: it.title || "", extract: text, url: it.url || "" });
  }

  // Rank by on-topic relevance and keep the best. If topic-scoring nukes everything (thin topic),
  // fall back to the raw top few rather than returning nothing.
  const scored = items.map((it) => ({ it, r: relevance(it) })).sort((a, b) => b.r - a.r);
  const onTopic = scored.filter((x) => x.r >= 1).map((x) => x.it);
  items = (onTopic.length >= 3 ? onTopic : items).slice(0, 12);

  const brief = items.map((it) => `- ${it.title ? it.title + ": " : ""}${it.extract}`).join("\n").slice(0, 3000);
  return { items, brief, queries };
}
