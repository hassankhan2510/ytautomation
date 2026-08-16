/**
 * LIVE CONTEXT — free, key-less, real-time facts so "today" topics are actually about today.
 * This is the fix for "the title says Gold Today but the video is generic": we feed the writer
 * the ACTUAL price + move + latest headlines, so the hook and title can be concrete and timely.
 *
 *   - Finance: live quote + daily % change from Yahoo Finance chart API (gold, silver, BTC, ETH,
 *     the big indices, and mega-cap tickers). No key.
 *   - AI / tech / business: latest headlines (last ~2 days) from Google News RSS. No key.
 *
 * Best-effort: any failure returns []. Returns [{ title, extract, url }] to prepend to grounding.
 */

async function fetchText(url, ms = 9000) {
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
async function fetchJSON(url, ms = 9000) {
  const txt = await fetchText(url, ms);
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

const today = () => new Date().toISOString().slice(0, 10);
const money = (n) =>
  n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// topic keyword -> Yahoo symbol + human name. First match wins; multiple can match.
const SYMBOLS = [
  { re: /\bgold\b|xau/i, sym: "GC=F", name: "Gold", unit: "$" },
  { re: /\bsilver\b|xag/i, sym: "SI=F", name: "Silver", unit: "$" },
  { re: /bitcoin|\bbtc\b/i, sym: "BTC-USD", name: "Bitcoin", unit: "$" },
  { re: /ethereum|\beth\b/i, sym: "ETH-USD", name: "Ethereum", unit: "$" },
  { re: /solana|\bsol\b/i, sym: "SOL-USD", name: "Solana", unit: "$" },
  { re: /\bxrp\b|ripple/i, sym: "XRP-USD", name: "XRP", unit: "$" },
  { re: /s ?& ?p|s and p|\b500\b|spx/i, sym: "^GSPC", name: "the S&P 500", unit: "" },
  { re: /nasdaq|ndx/i, sym: "^IXIC", name: "the Nasdaq", unit: "" },
  { re: /\bdow\b|djia/i, sym: "^DJI", name: "the Dow Jones", unit: "" },
  { re: /nvidia|nvda/i, sym: "NVDA", name: "Nvidia", unit: "$" },
  { re: /tesla|tsla/i, sym: "TSLA", name: "Tesla", unit: "$" },
  { re: /apple|aapl/i, sym: "AAPL", name: "Apple", unit: "$" },
  { re: /amazon|amzn/i, sym: "AMZN", name: "Amazon", unit: "$" },
  { re: /google|alphabet|googl/i, sym: "GOOGL", name: "Alphabet", unit: "$" },
  { re: /\bmeta\b|facebook/i, sym: "META", name: "Meta", unit: "$" },
  { re: /microsoft|msft/i, sym: "MSFT", name: "Microsoft", unit: "$" },
];
// Always-on market backdrop so a generic "market today" topic still gets real numbers.
const DEFAULT_FINANCE = ["^GSPC", "GC=F", "BTC-USD"];

async function quote(sym, name, unit) {
  const j = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`);
  const m = j?.chart?.result?.[0]?.meta;
  const price = m && typeof m.regularMarketPrice === "number" ? m.regularMarketPrice : null;
  if (price == null) return null;
  const prev = typeof m.chartPreviousClose === "number" ? m.chartPreviousClose
    : typeof m.previousClose === "number" ? m.previousClose : null;
  const chg = prev ? ((price - prev) / prev) * 100 : null;
  const dir = chg == null ? "flat" : chg >= 0 ? "up" : "down";
  const label = name || m.shortName || sym;
  const extract =
    `As of ${today()}, ${label} is trading around ${unit}${money(price)}` +
    (chg != null ? `, ${dir} ${Math.abs(chg).toFixed(2)}% on the day (prior close ${unit}${money(prev)}).` : ".") +
    (typeof m.regularMarketDayHigh === "number" && typeof m.regularMarketDayLow === "number"
      ? ` Today's range: ${unit}${money(m.regularMarketDayLow)}–${unit}${money(m.regularMarketDayHigh)}.` : "");
  return { title: `${label} — live quote`, extract, url: `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}` };
}

async function finance(topic) {
  const matched = SYMBOLS.filter((s) => s.re.test(topic));
  const picks = (matched.length ? matched : DEFAULT_FINANCE.map((sym) => SYMBOLS.find((s) => s.sym === sym)))
    .filter(Boolean)
    .slice(0, 5);
  const out = await Promise.all(picks.map((p) => quote(p.sym, p.name, p.unit)));
  return out.filter(Boolean);
}

export async function news(query, max = 5) {
  const xml = await fetchText(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:2d")}&hl=en-US&gl=US&ceid=US:en`,
  );
  if (!xml) return [];
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, max);
  const un = (s) => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  const get = (b, tag) => (b.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1];
  return items
    .map((m) => {
      const b = m[1];
      const title = un(get(b, "title"));
      const src = un(get(b, "source"));
      const date = un(get(b, "pubDate")).replace(/ \d\d:\d\d:\d\d.*$/, "");
      if (!title) return null;
      return { title: `Headline — ${date}`, extract: `${title}${src ? ` (${src})` : ""}`, url: un(get(b, "link")) };
    })
    .filter(Boolean);
}

/**
 * Real-time facts for a topic, chosen by niche. Returns [] for niches/topics with no live angle.
 */
export async function liveContext(topic, niche) {
  const t = String(topic || "").trim();
  if (!t) return [];
  const out = [];
  try {
    if (niche === "finance") {
      out.push(...(await finance(t)));
      out.push(...(await news(t, 3))); // + why-it-moved headlines
    } else if (niche === "deeptech" || niche === "ai") {
      out.push(...(await news(t || "artificial intelligence breakthrough", 5)));
    } else if (niche === "business") {
      out.push(...(await news(t, 4)));
    }
  } catch {
    /* best-effort */
  }
  return out;
}
