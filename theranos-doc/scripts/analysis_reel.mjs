/**
 * DAILY MARKET ANALYSIS REEL generator (Phase 3).
 *
 * Weekdays: builds a pro-trader analysis reel for Gold or Bitcoin — real candlestick charts
 * (intraday + daily) with VWAP / moving-average / support-resistance overlays, and spoken analysis
 * that explains the session. Numbers come from lib_market.mjs (never invented); Groq writes only the
 * narration around them. Weekends (market closed): a mature "deep-dive" on a US stock instead.
 *
 *   CHANNEL=equitier ASSET=gold GROQ_API_KEY=xxx node scripts/analysis_reel.mjs
 *   CHANNEL=equitier ASSET=btc  node scripts/analysis_reel.mjs
 *   CHANNEL=equitier MODE=deepdive node scripts/analysis_reel.mjs   # weekend stock explainer
 *
 * Writes jobs/<channel>_<asset>.json + jobs/<channel>_<asset>.research.md, then `npm run batch` renders.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, analyzeSymbol, smaSeries } from "./lib_market.mjs";
import { news } from "./lib_live.mjs";
import { recentTopicKeys, appendHistory, normKey } from "./lib_history.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const JOBS = path.join(ROOT, "jobs");

const CHANNEL = (process.env.CHANNEL || "equitier").toLowerCase();
const ASSET = (process.env.ASSET || "gold").toLowerCase();
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Weekend = US market closed → deep-dive instead of live analysis. Use PKT day (UTC+5) since we post
// in the morning PKT. MODE=deepdive forces it; MODE=analysis forces the market reel.
function isWeekendPKT() {
  const pkt = new Date(Date.now() + 5 * 3600 * 1000);
  const d = pkt.getUTCDay(); // 0 Sun … 6 Sat
  return d === 0 || d === 6;
}
const MODE = (process.env.MODE || (isWeekendPKT() ? "deepdive" : "analysis")).toLowerCase();

const OVER = { sma20: "#38bdf8", sma50: "#f5a623", sma200: "#a78bfa", vwap: "#facc15" };
// The date the reel is generated — shown on the chart so viewers know the analysis is time-stamped.
const DATE_LABEL = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "channels", "config.json"), "utf-8"));
  return cfg[CHANNEL] || {};
}
function fmt(n, d) {
  return n == null ? "" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "clip";
}

/* ---------- Groq (best-effort; deterministic fallback if it fails) ---------- */
async function callGroq(system, user) {
  if (!GROQ_API_KEY) { console.log("  ! GROQ_API_KEY not set — using fallback narration"); return null; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL, temperature: 0.5, max_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      const data = await res.json();
      const txt = data.choices?.[0]?.message?.content || "";
      const parsed = (() => { try { return JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } })();
      if (parsed) { console.log(`  ✓ Groq OK (${GROQ_MODEL})`); return parsed; }
      throw new Error("Groq returned empty/unparseable JSON");
    } catch (e) {
      console.log(`  ! Groq attempt ${attempt + 1}/3 failed: ${e.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  console.log("  ! Groq unavailable after retries — using fallback narration");
  return null;
}

const NARRATION_RULES = `
You are a top-tier markets analyst writing a short vertical reel (Instagram/Facebook). Voice: sharp,
confident, IG-native, speaks directly to "you". You EXPLAIN the market like the best traders do —
market structure, momentum, key levels, what's driving it — but you give NO buy/sell signals, NO
entries, NO targets (this is analysis/education, not advice).
HARD RULES:
- Spell numbers as words in the spoken lines ("forty-four hundred", "one and a half percent"). Do NOT
  use the $ or % symbols in the spoken text. The exact figures are shown on the chart, not spoken.
- Each spoken line is 1-2 sentences, punchy, specific, and flows into the next.
- Use ONLY the data provided. Do not invent numbers or news.`;

// Hard technical-analysis voice for the GOLD/BTC day-trade reels (not the educational stock deep-dive).
const TA_RULES = `
You are a top 0.01% technical DAY TRADER writing a fast vertical reel. This is HARD technical analysis,
not general commentary — zero fluff.
- Read the ACTUAL chart data and reference the real levels, VWAP, moving averages, RSI and ATR by their
  (spelled-out) numbers.
- Talk market STRUCTURE: higher highs / lower lows, breakouts, retests, ranges, and reclaim or rejection
  of specific levels.
- Read momentum (RSI overbought/oversold/strength), volatility (ATR = expected range), and exactly where
  price sits versus VWAP and the moving averages.
- Use multi-timeframe CONFLUENCE: how the one-hour and four-hour line up with the daily and weekly.
- Be decisive in the READ, not advice: e.g. "reclaiming the level flips intraday structure bullish",
  "rejecting the four-hour supply", "holding above VWAP keeps buyers in control". NO buy/sell signals,
  entries, stops or targets.
- Spell numbers as words in "say"; NO $ or % in "say" (those go in the callout). No generic filler.`;

function snapshotText(s) {
  const t = s.timeframes;
  const list = (arr) => arr.map((x) => fmt(x, s.decimals)).join(", ") || "n/a";
  return [
    `${s.name} (${s.pair}) — today`,
    `Price ${fmt(s.price, s.decimals)} (${s.changePct >= 0 ? "+" : ""}${s.changePct}% on the day), day range ${fmt(s.day.low, s.decimals)}–${fmt(s.day.high, s.decimals)}, VWAP ${fmt(s.day.vwap, s.decimals)}`,
    `1H  support ${list(t.h1.support)}; resistance ${list(t.h1.resistance)}`,
    `4H  support ${list(t.h4.support)}; resistance ${list(t.h4.resistance)}`,
    `Daily  SMA20/50/200 ${fmt(s.swing.sma20, s.decimals)}/${fmt(s.swing.sma50, s.decimals)}/${fmt(s.swing.sma200, s.decimals)}, RSI ${s.swing.rsi}, ATR ${s.swing.atr}, trend ${s.swing.trend}`,
    `Major support ${list(s.swing.majorSupport)}; major resistance ${list(s.swing.majorResistance)}; weekly RSI ${s.swing.weekRsi}`,
  ].join("\n");
}

/* ---------- multi-timeframe chart scene builder ---------- */
// A scene whose FULL background is a real chart for the given timeframe, with a short on-screen
// callout (the only "caption") and the spoken analysis in `text`.
function tfScene(snap, tfKey, tfLabel, text, callout, keywords, vwap = false) {
  const tf = snap.timeframes[tfKey] || { candles: [], overlays: [], support: [], resistance: [] };
  const overlays = (tf.overlays || []).map((o) => ({
    label: `SMA${o.period}`, color: o.period >= 50 ? OVER.sma50 : OVER.sma20, points: o.points,
  }));
  const levels = [
    ...tf.resistance.map((p) => ({ price: p, label: `R ${fmt(p, snap.decimals)}`, kind: "resistance" })),
    ...tf.support.map((p) => ({ price: p, label: `S ${fmt(p, snap.decimals)}`, kind: "support" })),
  ];
  if (vwap && snap.day.vwap) levels.push({ price: snap.day.vwap, label: `VWAP ${fmt(snap.day.vwap, snap.decimals)}`, kind: "level" });
  return {
    text, keywords, layout: "candles", callout,
    candles: tf.candles, overlays, levels, timeframe: tfLabel,
    pair: snap.pair, assetName: snap.name, priceNow: snap.price, changePct: snap.changePct, decimals: snap.decimals,
    dateLabel: DATE_LABEL,
  };
}

/* ---------- meta ---------- */
function buildMeta(cfg, { title, description, hashtags, tags, topic, thumb }, lineCount) {
  return {
    title: (title || topic).slice(0, 100),
    titleOptions: [], hashtags: hashtags && hashtags.length ? hashtags.slice(0, 12) : ["markets"],
    topic, niche: "finance", channel: CHANNEL, platform: "reel",
    targetSeconds: Math.max(30, Math.round(lineCount * 5)), fps: 30, style: "finance",
    voice: cfg.voice || "en-US-GuyNeural", kokoroVoice: cfg.kokoroVoice || "am_onyx",
    voiceRate: cfg.voiceRate || "+6%", language: "en",
    brand: cfg.brand || CHANNEL.toUpperCase(), tagline: cfg.tagline || "", links: cfg.links || null,
    disclaimer: cfg.disclaimer || "", thumbStyle: cfg.thumbStyle || "", thumb: thumb || null,
    pauseBetweenLinesSec: 0.15, accentColor: cfg.accentColor || "#10b981",
    description: description || title || topic,
    tags: tags && tags.length >= 3 ? tags.slice(0, 15) : ["markets", "analysis", "trading"],
    researchFile: "research.md", requireResearch: false,
  };
}

function writeJob(name, meta, lines, sources) {
  fs.mkdirSync(JOBS, { recursive: true });
  fs.writeFileSync(path.join(JOBS, `${name}.json`), JSON.stringify({ meta, lines }, null, 2));
  const rl = ["# Research (auto — market data + headlines)\n", "- Source: https://finance.yahoo.com/"];
  for (const s of sources || []) rl.push(`- ${s.extract || s.title}${s.url ? "\n  Source: " + s.url : ""}`);
  fs.writeFileSync(path.join(JOBS, `${name}.research.md`), rl.join("\n"));
  console.log(`  + jobs/${name}.json  (${lines.length} lines, reel)`);
}

/* ---------- WEEKDAY: market analysis reel ---------- */
async function marketReel(cfg) {
  const snap = await analyze(ASSET);
  const heads = await news(`${snap.name} price today`, 3).catch(() => []);
  const headTxt = heads.map((h) => `- ${h.extract}`).join("\n") || "(no fresh headlines)";

  const u = snap.unit;
  const s = snap.swing, d = snap.day;
  const rsiState = s.rsi >= 70 ? "overbought" : s.rsi <= 30 ? "oversold" : s.rsi >= 60 ? "strong" : s.rsi <= 40 ? "weak" : "neutral";
  const vwapRel = d.vwap != null ? (snap.price >= d.vwap ? "above" : "below") : "near";
  const ma50Rel = s.sma50 != null ? (snap.price >= s.sma50 ? "above" : "below") : "n/a";
  const ma200Rel = s.sma200 != null ? (snap.price >= s.sma200 ? "above" : "below") : "n/a";
  const taContext = [
    `Price ${vwapRel} VWAP (${fmt(d.vwap, snap.decimals)})`,
    `RSI ${s.rsi} = ${rsiState}`,
    `Price ${ma50Rel} the 50-day MA and ${ma200Rel} the 200-day MA`,
    `ATR ${s.atr} = expected daily range`,
    `Daily trend: ${s.trend}`,
  ].join("\n");

  const sys = `${TA_RULES}\nReturn ONLY JSON: {"title","description","hashtags":[6-8],"tags":[6-10],"beats":{"hook":{"say","callout"},"snapshot":{"say","callout"},"intraday":{"say","callout"},"h4":{"say","callout"},"daily":{"say","callout"},"weekly":{"say","callout"},"scenario":{"say","callout"}}}. Each "say" = 1-2 spoken sentences (spell numbers, NO $ or % in "say"). Each "callout" = 2-6 words or a level for the SCREEN ($ and % are fine in callout).`;
  const usr = `ASSET: ${snap.name} (${snap.pair})\nCHART DATA:\n${snapshotText(snap)}\nTECHNICAL READ:\n${taContext}\nTODAY'S HEADLINES:\n${headTxt}\n
Write a HARD multi-timeframe technical day-trade breakdown as spoken beats + short on-screen callouts. Reference the real levels/VWAP/MAs/RSI above:
hook (scroll-stopping technical read), snapshot (price vs VWAP + the move), intraday (the 1-hour structure using VWAP + the exact 1H levels — reclaim/reject), h4 (4-hour structure & momentum), daily (swing structure via the moving averages + RSI + major levels), weekly (higher-timeframe confluence for the swing), scenario ("holding X keeps structure bullish, losing X flips it" — analysis, not advice). Also a specific title, SEO description, hashtags, tags.`;

  const g = (await callGroq(sys, usr)) || {};
  const b = g.beats || {};
  const beat = (k, say, callout) => ({ say: (b[k] && b[k].say) || say, callout: (b[k] && b[k].callout) || callout });
  const pct = `${snap.changePct >= 0 ? "+" : ""}${snap.changePct}%`;
  const lvl = (arr) => (arr && arr.length ? `${u}${fmt(arr[0], snap.decimals)}` : `${u}${fmt(snap.price, snap.decimals)}`);
  const control = vwapRel === "above" ? "buyers" : "sellers";

  // Technical fallbacks (used only if Groq is down) — still reference the real reads, not generic filler.
  const B = {
    hook: beat("hook", `${snap.name} is ${rsiState} and trading ${vwapRel} its intraday average — here's the full technical read across timeframes.`, `${snap.name} ${vwapRel} VWAP`),
    snapshot: beat("snapshot", `Price is ${vwapRel} the volume-weighted average, which keeps ${control} in control of the session for now.`, `${pct} today · VWAP ${u}${fmt(d.vwap, snap.decimals)}`),
    intraday: beat("intraday", `On the one-hour, the level that matters is the intraday support — reclaim it and structure stays constructive, lose it and the intraday trend rolls over.`, `1H · reclaim ${lvl(snap.timeframes.h1.support)}`),
    h4: beat("h4", `The four-hour ${s.trend.includes("up") ? "is holding higher lows, so momentum sits with the bulls" : "is pressing lower highs, so momentum sits with the bears"} short term.`, `4H · ${s.trend}`),
    daily: beat("daily", `On the daily, price is ${ma50Rel} the fifty-day and ${ma200Rel} the two-hundred-day, with relative strength ${rsiState} — that frames how stretched the move is.`, `RSI ${s.rsi} · ${rsiState}`),
    weekly: beat("weekly", `On the weekly, the major resistance overhead is the line swing traders need reclaimed for the next leg higher.`, `Weekly · ${lvl(s.majorResistance)}`),
    scenario: beat("scenario", `Holding the major support keeps the structure bullish; losing it puts the daily trend in question. Follow for tomorrow's breakdown.`, `Hold ${lvl(s.majorSupport)} → bullish`),
  };

  const lines = [
    tfScene(snap, "daily", "Daily · 6M", B.hook.say, B.hook.callout, [`${snap.name} chart`]),
    tfScene(snap, "h1", "1H · Today", B.snapshot.say, B.snapshot.callout, [`${snap.name} price`], true),
    tfScene(snap, "h1", "1H · Day Trade", B.intraday.say, B.intraday.callout, [`${snap.name} intraday`], true),
    tfScene(snap, "h4", "4H · Structure", B.h4.say, B.h4.callout, [`${snap.name} 4h`]),
    tfScene(snap, "daily", "Daily · Swing", B.daily.say, B.daily.callout, [`${snap.name} daily`]),
    tfScene(snap, "weekly", "Weekly · Macro", B.weekly.say, B.weekly.callout, [`${snap.name} weekly`]),
    tfScene(snap, "daily", "Daily · Levels", B.scenario.say, B.scenario.callout, [`${snap.name} levels`]),
  ];

  const defaultTags = ASSET === "gold"
    ? ["gold", "xauusd", "gold price", "gold analysis", "trading", "technical analysis", "markets", "investing"]
    : ["bitcoin", "btc", "crypto", "bitcoin analysis", "trading", "technical analysis", "markets", "investing"];
  const meta = buildMeta(cfg, {
    title: g.title, description: g.description, hashtags: g.hashtags, tags: g.tags && g.tags.length >= 3 ? g.tags : defaultTags,
    topic: `${snap.name} daily analysis`, thumb: { line1: snap.name, line2: "ANALYSIS", sub: `${pct} today` },
  }, lines.length);

  writeJob(`${CHANNEL}_${ASSET}`, meta, lines, heads);
}

/* ---------- WEEKEND: stock deep-dive ---------- */
const STOCKS = [
  { sym: "AAPL", name: "Apple" }, { sym: "NVDA", name: "Nvidia" }, { sym: "MSFT", name: "Microsoft" },
  { sym: "TSLA", name: "Tesla" }, { sym: "AMZN", name: "Amazon" }, { sym: "GOOGL", name: "Alphabet" },
  { sym: "META", name: "Meta" }, { sym: "AMD", name: "AMD" }, { sym: "NFLX", name: "Netflix" },
  { sym: "COST", name: "Costco" }, { sym: "JPM", name: "JPMorgan" }, { sym: "V", name: "Visa" },
];
async function deepDive(cfg) {
  const recent = recentTopicKeys(CHANNEL, 21);
  const pick = STOCKS.find((s) => !recent.has(normKey(s.name))) || STOCKS[(new Date().getUTCDate()) % STOCKS.length];
  const snap = await analyzeSymbol(pick.sym, { name: pick.name.toUpperCase(), pair: pick.sym, decimals: 2 });
  const heads = await news(`${pick.name} stock`, 4).catch(() => []);
  const headTxt = heads.map((h) => `- ${h.extract}`).join("\n") || "(no fresh headlines)";

  const sys = `${NARRATION_RULES}\nThis is a WEEKEND educational deep-dive on a US stock (markets closed). Mature, insightful, no hype. Return ONLY JSON: {"title","description","hashtags":[6-8],"tags":[6-10],"beats":{"hook":{"say","callout"},"business":{"say","callout"},"numbers":{"say","callout"},"story":{"say","callout"},"takeaway":{"say","callout"}}}. "say" = 1-2 spoken sentences (spell numbers, no $ or %). "callout" = 2-6 words for the screen ($/% ok).`;
  const usr = `COMPANY: ${pick.name} (${pick.sym})\nPRICE DATA:\n${snapshotText(snap)}\nRECENT HEADLINES:\n${headTxt}\n
Write an advanced but accessible breakdown as beats + short callouts: hook, business (what the company does + why it matters), numbers (what the weekly/daily chart structure shows — trend, moving averages, major levels), story (the current narrative / what to watch), takeaway (mature closer + soft "follow for the next breakdown"). No price targets or advice. Also title, description, hashtags, tags.`;

  const g = (await callGroq(sys, usr)) || {};
  const b = g.beats || {};
  const beat = (k, say, callout) => ({ say: (b[k] && b[k].say) || say, callout: (b[k] && b[k].callout) || callout });
  const B = {
    hook: beat("hook", `Everyone knows ${pick.name} — but here's what most people miss.`, `${pick.name}, explained`),
    business: beat("business", `${pick.name} is one of the most important companies in the market, and its story is bigger than its stock price.`, `What ${pick.name} really does`),
    numbers: beat("numbers", `On the daily chart, ${pick.name} is in a ${snap.swing.trend}, with the moving averages framing the trend.`, `RSI ${snap.swing.rsi} · ${snap.swing.trend}`),
    story: beat("story", `The real question is what happens next — the chart and the fundamentals each tell part of that story.`, `What to watch next`),
    takeaway: beat("takeaway", `That's the deep-dive on ${pick.name}. Follow for the next breakdown.`, `Follow for more`),
  };

  const lines = [
    tfScene(snap, "weekly", "Weekly · 2Y", B.hook.say, B.hook.callout, [`${pick.name} company`]),
    tfScene(snap, "daily", "Daily · 1Y", B.business.say, B.business.callout, [`${pick.name} business`]),
    tfScene(snap, "daily", "Daily · Trend", B.numbers.say, B.numbers.callout, [`${pick.name} chart`]),
    tfScene(snap, "weekly", "Weekly · Big Picture", B.story.say, B.story.callout, [`${pick.name} outlook`]),
    tfScene(snap, "daily", "Daily", B.takeaway.say, B.takeaway.callout, [`${pick.name} takeaway`]),
  ];

  const meta = buildMeta(cfg, {
    title: g.title || `${pick.name} Stock, Explained: What Smart Investors Actually Watch`,
    description: g.description, hashtags: g.hashtags,
    tags: g.tags && g.tags.length >= 3 ? g.tags : [pick.name.toLowerCase(), pick.sym.toLowerCase(), "stocks", "investing", "stock market", "finance"],
    topic: `${pick.name} stock deep dive`, thumb: { line1: pick.name.toUpperCase(), line2: "EXPLAINED", sub: "What investors watch" },
  }, lines.length);

  writeJob(`${CHANNEL}_deepdive`, meta, lines, heads);
  appendHistory(CHANNEL, { topic: pick.name, title: meta.title });
}

async function main() {
  const cfg = loadConfig();
  console.log(`analysis_reel | channel ${CHANNEL} | mode ${MODE}${MODE === "analysis" ? ` | asset ${ASSET}` : ""}`);
  console.log(`Groq: key ${GROQ_API_KEY ? "SET" : "MISSING"} | model ${GROQ_MODEL}`);
  if (MODE === "deepdive") await deepDive(cfg);
  else await marketReel(cfg);
  console.log(`Done. Render with: npm run batch -- --only=${CHANNEL}`);
}
main().catch((e) => { console.error("analysis_reel failed:", e.message); process.exit(1); });
