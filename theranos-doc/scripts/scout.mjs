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

import { recentTopicKeys, recentSigs, normKey, sig, jaccard } from "./lib_history.mjs";

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const CHANNEL = (arg("channel", "equitier")).toLowerCase();
const ONE = process.argv.includes("--one");

// Per-channel search seeds + filters. (Only Equitier is wired for now.)
const CHANNELS = {
  equitier: {
    // Daily = high-view "market updates" (stocks, gold, silver, bitcoin) — the shorts YouTube pushes
    // hardest in finance because they ride searches that spike EVERY DAY. Use the manual workflow
    // for evergreen how-to topics.
    // Shorts win on curiosity + wealth psychology, not daily price recaps (commodity → buried).
    // Seed high-engagement money/investing angles. Riba/interest stays blocked below (user's line).
    // Favour "how X actually works" TECHNICAL breakdowns of a specific instrument/asset — the steer
    // turns these into top-0.01% desk-analyst explainers, not generic "get rich" content.
    seeds: [
      "how the stock market actually works", "how forex trading actually works", "eur usd explained",
      "how etfs actually work", "etf vs index fund", "how index funds actually work",
      "how reits work", "how real estate builds wealth", "how dividends actually work",
      "how options trading works", "how a stock is valued", "how gold is priced",
      "what moves the stock market", "how nvidia makes money", "how tesla makes money",
      "how bitcoin actually works", "how forex pairs move", "how earnings move a stock",
      "how the fed moves markets", "how to read a stock chart", "what is market cap really",
      "how billionaires invest their money", "stock market crash explained",
    ],
    // Equitier is general-audience finance BUT must avoid interest/riba topics (user's line).
    block: /interest|mortgage|\bloans?\b|credit\s?card|\bapr\b|high[-\s]?yield|savings account|\bbonds?\b|refinanc|heloc|credit score|\bdebt\b|bnpl|buy now pay later|riba|payday/i,
    boost: /stock|\bmarket|nasdaq|s&p|dow\b|gold|silver|bitcoin|btc|ethereum|\beth\b|crypto|solana|\bxrp\b|forex|\betf\b|reit|dividend|option|valuation|earning|\bfed\b|\bprice\b|chart|market cap|surge|crash|rally|nvidia|tesla|apple|amazon|meta|invest|econom|money|wealth|\brich|income|inflation|financ|billionaire|passive|budget|retire/i,
  },
  cohortzero: {
    // Founder/VC EDUCATION — tactical mechanics a student or early founder actually needs. The steer
    // pushes for real numbers/examples and Y-Combinator-beating clarity, not motivation.
    seeds: [
      "how vcs read a pitch deck", "what vcs look for in a startup", "how startup fundraising works",
      "how cap tables work", "what is a term sheet", "startup equity explained",
      "how founders split equity", "how to pitch to investors", "seed round explained",
      "startup valuation explained", "how yc chooses startups", "product market fit explained",
      "saas metrics explained", "how to build a pitch deck", "how startups make money",
      "why startups fail", "how convertible notes work", "how down rounds work",
      "pakistani startup success story", "how to raise a seed round in pakistan",
      "biggest startup failures", "famous founder stories",
    ],
    block: /nsfw|onlyfans|gambling|casino/i,
    boost: /startup|business|founder|company|entrepreneur|venture|\bvc\b|\byc\b|scal|revenue|customer|product|market fit|billion|acqui|ipo|fund|pitch|deck|term sheet|cap table|equity|dilution|valuation|seed|saas|strategy|pakistan/i,
  },
  // Pakistan-focused Cohort Zero (for TikTok): founder / entrepreneurship lust the local audience is
  // searching daily. Same brand + accent, different topic pool + language flavour.
  cohortzero_pk: {
    seeds: [
      "how to become entrepreneur in pakistan", "pakistani startup success story",
      "business ideas in pakistan", "young entrepreneur pakistan", "how to start business in pakistan",
      "pakistani founder story", "careem story", "airlift pakistan", "bazaar pakistan startup",
      "bykea founder", "foodpanda pakistan", "krave mart", "sadapay founder", "raast pakistan",
      "how to make money in pakistan", "side business in pakistan", "small business ideas pakistan",
      "why startups fail in pakistan", "pakistani businessman success", "how to be rich in pakistan",
      "student business ideas pakistan", "online business in pakistan", "freelance in pakistan",
    ],
    // No riba (interest) for the user's line, plus obvious junk out.
    block: /interest|mortgage|\bloans?\b|credit\s?card|payday|riba|nsfw|gambling|casino/i,
    boost: /pakistan|karachi|lahore|islamabad|founder|entrepreneur|startup|business|\brich\b|hustle|careem|airlift|bazaar|foodpanda|bykea|sadapay|krave|money|success|jazz|makro|daraz/i,
  },
  syndar: {
    // Shorts win on CURIOSITY, not "news today" (that's commodity content that gets buried). Seed
    // high-intrigue AI/robotics/tech angles that hook and travel, plus Syndar's own perception/
    // autonomy niche ("how machines see", "why cameras fail") — its actual differentiator.
    // PHYSICAL AI / robotics — favour "how does X actually work" mechanism explainers on the most
    // advanced 2026-2027 systems, which the editorial steer turns into deep technical breakdowns.
    seeds: [
      "how humanoid robots actually work", "how tesla optimus works", "how figure 02 robot works",
      "how robots learn to walk", "how humanoid robots balance", "how robot hands grip objects",
      "embodied ai explained", "physical ai explained", "vision language action model explained",
      "how robots see in 3d", "how self driving cars see the road", "lidar vs camera self driving",
      "sim to real robotics explained", "reinforcement learning robots", "world models ai explained",
      "how boston dynamics atlas works", "how robot actuators work", "dexterous robot hand",
      "most advanced humanoid robot 2026", "how does chatgpt actually work", "how ai agents work",
      "why robots struggle to walk", "how drones navigate without gps",
    ],
    block: /nsfw|gambling|casino|toy review/i,
    boost: /\bai\b|openai|chatgpt|gemini|claude|grok|deepseek|llm|robot|humanoid|optimus|figure|atlas|boston dynamics|embodied|locomotion|actuator|dexterous|grasp|lidar|perception|world model|\bvla\b|physical ai|breakthrough|explained|autonom|waymo|self[-\s]?driving|drone|agent|neural|deepmind|nvidia|\btech|technolog|future|sensor|automat/i,
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
const NOISE = /\b(tilbury|nazareth|mcqueen|ramsey|graham stephan|meet kevin|minority mindset|coffeezilla|abdaal|reddit|quora|song|lyrics|movie|meme|roblox|gta|fortnite|hindi|tamil|telugu|urdu|malayalam|bangla|bengali|odia|marathi|punjabi|gujarati|kannada|n8n|newsletter|class \d)\b/i;

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
    // Never repeat a topic used in the last 14 days. The old `dayOfYear() % len` "rotation" was an
    // illusion — the candidate list is re-fetched live every day, so its length/order shift and the
    // modulo could re-land on the same phrase. Instead we drop anything recently posted (persisted
    // in channels/history/<channel>.json) and take the strongest remaining topic.
    const recent = recentTopicKeys(CHANNEL, 30);
    const recentS = recentSigs(CHANNEL, 30);
    const fresh = cand.filter((q) => {
      if (recent.has(normKey(q))) return false;              // exact topic-family match
      const qs = sig(q);
      return !recentS.some(({ s }) => jaccard(qs, s) >= 0.6); // near-dupe of a recent topic/title
    });
    const pool = fresh.length ? fresh : cand; // if the whole pool is exhausted, fall back to all
    // Among the top of the fresh, ranked list, rotate by day so two runs on the same day differ too.
    const top = pool.slice(0, Math.max(1, Math.min(10, pool.length)));
    console.log(top[dayOfYear() % top.length]);
  } else {
    console.log(`Top topics for ${CHANNEL} (${cand.length} found):\n`);
    cand.slice(0, 15).forEach((q, i) => console.log(`${String(i + 1).padStart(2)}. ${q}`));
  }
}

main().catch((e) => { console.error("scout failed:", e.message); process.exit(1); });
