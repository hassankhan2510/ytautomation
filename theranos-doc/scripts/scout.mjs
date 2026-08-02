/**
 * TOPIC SCOUT: find what people are actually searching, and pick a topic for a video.
 * Free sources, no API keys:
 *   - YouTube search autocomplete (the real phrases people type into YouTube)  [primary]
 *   - Google Trends daily RSS                                                   [bonus]
 *
 * Per-channel seeds + a block-list (e.g. Equitier drops anything interest/riba-related).
 *
 *   node scripts/scout.mjs --channel=equitier            # print a ranked list
 *   node scripts/scout.mjs --channel=equitier --one      # print ONE topic (for the daily auto-run)
 */

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const CHANNEL = (arg("channel", "equitier")).toLowerCase();
const ONE = process.argv.includes("--one");

// Per-channel search seeds + filters. (Only Equitier is wired for now.)
const CHANNELS = {
  equitier: {
    seeds: [
      "how to invest for beginners", "index funds", "stock market for beginners",
      "passive income ideas", "how to save money", "money mistakes", "how to build wealth",
      "inflation explained", "investing mistakes", "gold investment", "financial freedom",
      "how to budget", "side hustle ideas", "how the rich build wealth", "money psychology",
      "biggest financial scams", "etf investing", "how to become a millionaire",
    ],
    // Equitier is general-audience finance BUT must avoid interest/riba topics (user's line).
    block: /interest|mortgage|\bloans?\b|credit\s?card|\bapr\b|high[-\s]?yield|savings account|\bbonds?\b|refinanc|heloc|credit score|\bdebt\b|bnpl|buy now pay later|riba|payday/i,
    boost: /invest|index fund|stock|money|wealth|inflation|passive income|\bsave\b|budget|gold|\betf\b|financ|retire|rich|millionaire|portfolio|dividend|scam|economy|recession/i,
  },
};

async function ytSuggest(seed) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(seed)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

async function googleTrends() {
  try {
    const res = await fetch("https://trends.google.com/trends/trendingsearches/daily/rss?geo=US", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].map((m) => m[1]).slice(1);
  } catch {
    return [];
  }
}

function clean(q) {
  let s = String(q || "").toLowerCase().replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/(\b20\d\d)\b.*$/, "$1"); // keep the year, cut trailing junk after it (e.g. "... 2025 mcqueen cars")
  s = s.replace(/[\s\-–—:|]+$/, "").trim();
  return s;
}

// Autocomplete pollution: creator-name completions and obvious junk we don't want as topics.
const NOISE = /\b(tilbury|nazareth|mcqueen|ramsey|graham stephan|meet kevin|minority mindset|coffeezilla|abdaal|reddit|quora|song|lyrics|movie|meme|roblox|gta|fortnite)\b/i;

// Dedupe key that ignores the year so "... in 2025 / 2026 / 2024" collapse to one entry.
const dkey = (q) => q.replace(/\b(in\s+)?20\d\d\b/g, "").replace(/\s+/g, " ").trim();

function score(q, cfg) {
  let s = 1;
  if (/^(how|why|what|is|are|best|should|can|the truth)/i.test(q)) s += 2; // question / listicle framing
  if (cfg.boost.test(q)) s += 2; // on-niche
  if (/\d/.test(q)) s += 1; // has a number (specific)
  const words = q.split(/\s+/).length;
  if (words >= 4 && words <= 10) s += 1; // good title length
  return s;
}

function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

async function main() {
  const cfg = CHANNELS[CHANNEL];
  if (!cfg) {
    console.error(`No scout config for "${CHANNEL}". Wired: ${Object.keys(CHANNELS).join(", ")}`);
    process.exit(1);
  }

  const pool = new Map(); // normalized -> original
  const suggestLists = await Promise.all(cfg.seeds.map((s) => ytSuggest(s)));
  for (const list of suggestLists) for (const q of list) {
    const c = clean(q);
    if (c) pool.set(c.toLowerCase(), c);
  }
  for (const t of await googleTrends()) {
    const c = clean(t);
    if (c && cfg.boost.test(c)) pool.set(c.toLowerCase(), c); // only finance-relevant trends
  }

  let cand = [...pool.values()].filter((q) => {
    const words = q.split(/\s+/).length;
    return (
      words >= 3 && words <= 11 && q.length <= 80 &&
      !cfg.block.test(q) && !NOISE.test(q) && cfg.boost.test(q)
    );
  });
  // rank best-first, then collapse near-duplicates (year variants, exact repeats)
  cand = cand.map((q) => ({ q, s: score(q, cfg) })).sort((a, b) => b.s - a.s).map((x) => x.q);
  const seen = new Set();
  cand = cand.filter((q) => {
    const k = dkey(q);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (!cand.length) {
    // Never leave the daily run without a topic — fall back to a solid evergreen.
    cand = ["The truth about passive income and what actually works"];
  }

  if (ONE) {
    // Rotate through the top of the list by day, so the daily short isn't the same topic twice.
    const top = cand.slice(0, 25);
    console.log(top[dayOfYear() % top.length]);
  } else {
    console.log(`Top topics for ${CHANNEL} (${cand.length} found):\n`);
    cand.slice(0, 15).forEach((q, i) => console.log(`${String(i + 1).padStart(2)}. ${q}`));
  }
}

main().catch((e) => { console.error("scout failed:", e.message); process.exit(1); });
