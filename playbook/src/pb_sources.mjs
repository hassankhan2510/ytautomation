/**
 * FEDERATED SOURCE LAYER — the research phase's toolbox of REAL, free, no-key data feeds.
 *
 * Every fetcher returns a normalised list of docs: { kind, title, url, text, source, meta }.
 * kind: "paper" | "web" | "data".  text is real fetched prose the extractor mines claims from.
 * Each fetcher is individually try/caught and time-bounded, and the whole thing runs under
 * Promise.allSettled in pb_research — so a slow or dead source can never break a run.
 *
 * The SOURCE_CATALOG (below) is also fed to the comprehension LLM so it knows what it can reach and
 * can route a topic to the right feeds (social science, philosophy, psychology, economics, tech…).
 */
import { fetchText, stripHtml } from "./pb_util.mjs";

const UA = "playbook-studio/1.0 (mailto:h.khan@nexauragroup.co.uk)";
const MAILTO = "h.khan@nexauragroup.co.uk";
const clipText = (s, n = 6000) => String(s || "").slice(0, n);

/* What the router may choose from. Keep descriptions terse — this string goes into an LLM prompt. */
export const SOURCE_CATALOG = `
- openalex   : 250M+ scholarly works, EVERY discipline (sociology, economics, philosophy, psychology,
               history, political science, CS). Best for surfacing the seminal/canonical literature.
- crossref   : scholarly metadata + abstracts across all journals (DOIs).
- semanticscholar : all-field papers with plain-language TLDRs (best-effort; may rate-limit).
- arxiv      : preprints in STEM + economics (econ.*) + quantitative finance (q-fin.*) + network/social
               physics (physics.soc-ph) + social & information networks (cs.SI). Use for technical/quant topics.
- europepmc  : life sciences, medicine, and PSYCHOLOGY papers with abstracts.
- sep        : Stanford Encyclopedia of Philosophy — rigorous, citable entries. Use for PHILOSOPHY topics.
- wikipedia  : encyclopedic grounding + concrete figures/dates for general & historical topics.
- worldbank  : real macroeconomic numbers (GDP, inflation, population, poverty…). Use for economics/finance data.
- coingecko  : live crypto market numbers. Use only for crypto topics.
- yahoo      : live stock/index quotes. Use only for markets/finance data.
`.trim();

/* domain -> which sources to hit. OpenAlex + Wikipedia are always on (OpenAlex covers every field well);
   Crossref is added only for scholarly domains (its relevance ranking is noisy on general queries). */
const DOMAIN_SOURCES = {
  "social-science": ["arxiv", "crossref", "semanticscholar"],
  economics: ["arxiv", "crossref", "worldbank", "semanticscholar"],
  finance: ["worldbank", "yahoo", "semanticscholar"],
  markets: ["yahoo", "worldbank"],
  crypto: ["coingecko", "semanticscholar"],
  "network-science": ["arxiv", "crossref", "semanticscholar"],
  psychology: ["europepmc", "crossref", "semanticscholar", "arxiv"],
  philosophy: ["sep", "crossref", "semanticscholar"],
  history: ["crossref", "semanticscholar"],
  technology: ["arxiv", "semanticscholar"],
  science: ["arxiv", "europepmc", "crossref", "semanticscholar"],
  general: ["crossref", "semanticscholar"],
};
const ALWAYS = ["openalex", "wikipedia"];

/* arXiv category sets keyed by domain, so a social/economics book pulls the RIGHT preprints. */
const ARXIV_CATS = {
  economics: ["econ.GN", "q-fin.GN", "q-fin.EC"],
  finance: ["q-fin.GN", "q-fin.PM", "q-fin.TR", "econ.GN"],
  "social-science": ["physics.soc-ph", "cs.SI", "econ.GN"],
  "network-science": ["physics.soc-ph", "cs.SI"],
  psychology: ["q-bio.NC", "cs.CY"],
  technology: ["cs.LG", "cs.AI", "cs.CY"],
  science: ["physics.soc-ph", "q-bio.NC"],
};

export function sourcesForDomains(domains = []) {
  const set = new Set(ALWAYS);
  for (const d of domains) for (const s of DOMAIN_SOURCES[d] || []) set.add(s);
  if (set.size === ALWAYS.length) DOMAIN_SOURCES.general.forEach((s) => set.add(s));
  return [...set];
}
export function arxivCatsForDomains(domains = []) {
  const set = new Set();
  for (const d of domains) for (const c of ARXIV_CATS[d] || []) set.add(c);
  return [...set];
}

/* ---------- scholarly (all-field) ---------- */
function abstractFromInverted(inv) {
  if (!inv) return "";
  const arr = [];
  for (const [w, ps] of Object.entries(inv)) for (const p of ps) arr[p] = w;
  return arr.filter(Boolean).join(" ");
}
export async function openalex(query, { perPage = 6 } = {}) {
  const u = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&sort=cited_by_count:desc&per-page=${perPage}&mailto=${MAILTO}`;
  const j = JSON.parse(await fetchText(u, { ms: 22000, headers: { "User-Agent": UA } }));
  return (j.results || []).map((w) => {
    const abs = abstractFromInverted(w.abstract_inverted_index);
    const authors = (w.authorships || []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean).join(", ");
    const text = `${w.title || ""}. ${abs}`.trim();
    return {
      kind: "paper", title: w.title || "(untitled)",
      url: w.doi ? `https://doi.org/${String(w.doi).replace(/^https?:\/\/doi\.org\//, "")}` : (w.id || ""),
      text: clipText(text), source: "OpenAlex",
      meta: { year: w.publication_year, citations: w.cited_by_count, authors },
    };
  }).filter((d) => d.text.length > 120 && d.url);
}
export async function crossref(query, { rows = 5 } = {}) {
  // relevance sort (Crossref default) — citation sort returns evergreen mega-papers unrelated to the query.
  const u = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${rows}&select=title,abstract,author,DOI,issued,is-referenced-by-count`;
  const j = JSON.parse(await fetchText(u, { ms: 22000, headers: { "User-Agent": UA } }));
  return (j.message?.items || []).map((it) => {
    const abs = stripHtml(it.abstract || "");
    const title = (it.title || [])[0] || "";
    const authors = (it.author || []).slice(0, 3).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean).join(", ");
    return {
      kind: "paper", title, url: it.DOI ? `https://doi.org/${it.DOI}` : "",
      text: clipText(`${title}. ${abs}`.trim()), source: "Crossref",
      meta: { year: it.issued?.["date-parts"]?.[0]?.[0], citations: it["is-referenced-by-count"], authors },
    };
  }).filter((d) => d.text.length > 120 && d.url);
}
export async function semanticscholar(query, { limit = 5 } = {}) {
  const u = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,tldr,year,citationCount,externalIds,url`;
  const txt = await fetchText(u, { ms: 20000, headers: { "User-Agent": UA }, tries: 1 }); // 1 try: it 429s a lot
  const j = JSON.parse(txt);
  return (j.data || []).map((p) => {
    const abs = p.abstract || p.tldr?.text || "";
    const url = p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : (p.url || "");
    return {
      kind: "paper", title: p.title || "", url,
      text: clipText(`${p.title || ""}. ${abs}`.trim()), source: "Semantic Scholar",
      meta: { year: p.year, citations: p.citationCount },
    };
  }).filter((d) => d.text.length > 120 && d.url);
}
export async function arxiv(query, { categories = [], n = 6 } = {}) {
  const q = query.replace(/[^\w\s]/g, " ").trim();
  const catExpr = categories.length ? "(" + categories.map((c) => `cat:${c}`).join("+OR+") + ")+AND+" : "";
  const u = `http://export.arxiv.org/api/query?search_query=${catExpr}all:${encodeURIComponent(q)}&sortBy=relevance&max_results=${n}`;
  const xml = await fetchText(u, { ms: 25000 });
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const g = (e, tag) => (e.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || "";
  return entries.map((e) => ({
    kind: "paper", title: stripHtml(g(e, "title")),
    url: (g(e, "id") || "").trim().replace("http:", "https:"),
    text: clipText(stripHtml(g(e, "summary"))), source: "arXiv",
    meta: { year: (g(e, "published") || "").slice(0, 4) },
  })).filter((d) => d.text.length > 120 && d.url);
}
export async function europepmc(query, { n = 5 } = {}) {
  const u = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${n}`;
  const j = JSON.parse(await fetchText(u, { ms: 22000, headers: { "User-Agent": UA } }));
  return (j.resultList?.result || []).map((r) => {
    const abs = stripHtml(r.abstractText || "");
    const url = r.doi ? `https://doi.org/${r.doi}` : (r.fullTextUrlList?.fullTextUrl?.[0]?.url || (r.pmid ? `https://europepmc.org/article/MED/${r.pmid}` : ""));
    return {
      kind: "paper", title: r.title || "", url,
      text: clipText(`${r.title || ""}. ${abs}`.trim()), source: "Europe PMC",
      meta: { year: r.pubYear, citations: r.citedByCount, authors: r.authorString },
    };
  }).filter((d) => d.text.length > 120 && d.url);
}

/* ---------- reference / encyclopedic ---------- */
export async function wikipedia(title) {
  const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
  const j = JSON.parse(await fetchText(api, { ms: 20000, headers: { "User-Agent": UA } }));
  const pages = j.query?.pages || {};
  const out = [];
  for (const k of Object.keys(pages)) {
    const t = stripHtml(pages[k].extract || "");
    if (t.length > 400) out.push({ kind: "web", title: pages[k].title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[k].title)}`, text: clipText(t), source: "Wikipedia", meta: {} });
  }
  return out;
}
export async function sep(query) {
  // Stanford Encyclopedia of Philosophy — find the best entry via its search, then read it.
  const s = `https://plato.stanford.edu/search/searcher.py?query=${encodeURIComponent(query)}`;
  const html = await fetchText(s, { ms: 22000, headers: { "User-Agent": UA } });
  const m = html.match(/href="(?:https?:\/\/plato\.stanford\.edu)?\/entries\/([a-z0-9-]+)\/?"/i);
  if (!m) return [];
  const slug = m[1];
  const entry = await fetchText(`https://plato.stanford.edu/entries/${slug}/`, { ms: 22000, headers: { "User-Agent": UA } });
  const main = (entry.match(/<div id="aueditable">([\s\S]*?)<div id="bibliography"/i) || entry.match(/<div id="main-text">([\s\S]*?)<\/div>/i) || [])[1] || entry;
  const text = stripHtml(main);
  if (text.length < 400) return [];
  const title = stripHtml((entry.match(/<h1>([\s\S]*?)<\/h1>/i) || [])[1] || slug);
  return [{ kind: "web", title: `${title} (Stanford Encyclopedia of Philosophy)`, url: `https://plato.stanford.edu/entries/${slug}/`, text: clipText(text, 8000), source: "Stanford Encyclopedia of Philosophy", meta: {} }];
}

/* ---------- hard numeric data ---------- */
const WB_INDICATORS = {
  gdp: "NY.GDP.MKTP.CD", "gdp per capita": "NY.GDP.PCAP.CD", inflation: "FP.CPI.TOTL.ZG",
  population: "SP.POP.TOTL", poverty: "SI.POV.DDAY", unemployment: "SL.UEM.TOTL.ZS",
  "gini inequality": "SI.POV.GINI", "internet users": "IT.NET.USER.ZS",
};
export async function worldbank(concepts = []) {
  const text = concepts.join(" ").toLowerCase();
  const picks = Object.entries(WB_INDICATORS).filter(([k]) => text.includes(k.split(" ")[0])).slice(0, 3);
  const chosen = picks.length ? picks : [["gdp", WB_INDICATORS.gdp], ["gini inequality", WB_INDICATORS["gini inequality"]]];
  const one = async ([name, code]) => {
    try {
      const j = JSON.parse(await fetchText(`https://api.worldbank.org/v2/country/WLD/indicator/${code}?format=json&per_page=6&mrnev=1`, { ms: 12000, tries: 1, headers: { "User-Agent": UA } }));
      const row = (j?.[1] || []).find((r) => r && r.value != null);
      return row ? { kind: "data", title: `World ${name} (${row.date})`, url: `https://data.worldbank.org/indicator/${code}`, text: `Global ${name} in ${row.date} was ${Number(row.value).toLocaleString()} (${row.indicator?.value}). Source: World Bank Open Data.`, source: "World Bank", meta: { year: Number(row.date), numeric: true } } : null;
    } catch { return null; }
  };
  return (await Promise.all(chosen.map(one))).filter(Boolean);
}
export async function coingecko(concepts = []) {
  try {
    const j = JSON.parse(await fetchText("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1", { ms: 18000, headers: { "User-Agent": UA } }));
    return (j || []).map((c) => ({ kind: "data", title: `${c.name} market snapshot`, url: `https://www.coingecko.com/en/coins/${c.id}`, text: `${c.name} (${(c.symbol || "").toUpperCase()}) traded at $${Number(c.current_price).toLocaleString()} with a market capitalisation of $${Number(c.market_cap).toLocaleString()}, ranked #${c.market_cap_rank} by market cap. Source: CoinGecko.`, source: "CoinGecko", meta: { numeric: true } }));
  } catch { return []; }
}
export async function yahoo(symbols = ["^GSPC", "^IXIC", "^DJI"]) {
  const out = [];
  for (const sym of symbols.slice(0, 4)) {
    try {
      const j = JSON.parse(await fetchText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`, { ms: 15000, headers: { "User-Agent": "Mozilla/5.0" } }));
      const r = j?.chart?.result?.[0];
      const price = r?.meta?.regularMarketPrice;
      if (price != null) out.push({ kind: "data", title: `${r.meta.symbol} level`, url: `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`, text: `${r.meta.symbol} last traded at ${Number(price).toLocaleString()} ${r.meta.currency || ""}. Source: Yahoo Finance.`, source: "Yahoo Finance", meta: { numeric: true } });
    } catch { /* skip symbol */ }
  }
  return out;
}

/* dispatcher used by pb_research: run one named source with a query set, always resolving to [] on error. */
export async function runSource(name, { queries = [], concepts = [], arxivCats = [] } = {}) {
  const safe = (p) => p.then((x) => x || []).catch(() => []);
  const q = queries.slice(0, 4);
  try {
    switch (name) {
      case "openalex": return (await Promise.all(q.map((x) => safe(openalex(x))))).flat();
      case "crossref": return (await Promise.all(q.map((x) => safe(crossref(x))))).flat();
      case "semanticscholar": return (await Promise.all(q.slice(0, 3).map((x) => safe(semanticscholar(x))))).flat();
      case "arxiv": return (await Promise.all(q.map((x) => safe(arxiv(x, { categories: arxivCats }))))).flat();
      case "europepmc": return (await Promise.all(q.map((x) => safe(europepmc(x))))).flat();
      case "wikipedia": return (await Promise.all(concepts.slice(0, 5).map((x) => safe(wikipedia(x))))).flat();
      case "sep": return (await Promise.all(q.slice(0, 3).map((x) => safe(sep(x))))).flat();
      case "worldbank": return await safe(worldbank(concepts));
      case "coingecko": return await safe(coingecko(concepts));
      case "yahoo": return await safe(yahoo());
      default: return [];
    }
  } catch { return []; }
}
