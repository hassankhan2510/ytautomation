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
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Weekend = US market closed → deep-dive instead of live analysis. Use PKT day (UTC+5) since we post
// in the morning PKT. MODE=deepdive forces it; MODE=analysis forces the market reel.
function isWeekendPKT() {
  const pkt = new Date(Date.now() + 5 * 3600 * 1000);
  const d = pkt.getUTCDay(); // 0 Sun … 6 Sat
  return d === 0 || d === 6;
}
const MODE = (process.env.MODE || (isWeekendPKT() ? "deepdive" : "analysis")).toLowerCase();

const OVER = { sma20: "#38bdf8", sma50: "#f5a623", sma200: "#a78bfa", vwap: "#facc15" };

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
  if (!GROQ_API_KEY) return null;
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
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      const data = await res.json();
      const txt = data.choices?.[0]?.message?.content || "";
      try { return JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
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

function snapshotText(s) {
  return [
    `${s.name} (${s.pair}) — as of today`,
    `Price ${fmt(s.price, s.decimals)} (${s.changePct >= 0 ? "+" : ""}${s.changePct}% on the day)`,
    `Day range ${fmt(s.day.low, s.decimals)}–${fmt(s.day.high, s.decimals)}, VWAP ${fmt(s.day.vwap, s.decimals)}`,
    `Intraday support ${s.intraday.support.map((x) => fmt(x, s.decimals)).join(", ") || "n/a"}; resistance ${s.intraday.resistance.map((x) => fmt(x, s.decimals)).join(", ") || "n/a"}`,
    `SMA20/50/200 ${fmt(s.swing.sma20, s.decimals)}/${fmt(s.swing.sma50, s.decimals)}/${fmt(s.swing.sma200, s.decimals)}; RSI ${s.swing.rsi}; ATR ${s.swing.atr}; trend ${s.swing.trend}`,
    `Major support ${s.swing.majorSupport.map((x) => fmt(x, s.decimals)).join(", ")}; major resistance ${s.swing.majorResistance.map((x) => fmt(x, s.decimals)).join(", ")}`,
  ].join("\n");
}

/* ---------- chart scene builder ---------- */
function chartScene(text, keywords, snap, candles, { timeframe, overlays = [], levels = [] }) {
  return {
    text, keywords, layout: "candles",
    candles: candles.map((c) => ({ o: c.o, h: c.h, l: c.l, c: c.c })),
    overlays, levels, timeframe, pair: snap.pair, assetName: snap.name,
    priceNow: snap.price, changePct: snap.changePct, decimals: snap.decimals,
  };
}

function intradayChart(snap, narration) {
  const c = snap.candles.intraday;
  const closes = c.map((x) => x.c);
  const levels = [
    ...snap.intraday.resistance.map((p) => ({ price: p, label: `R ${fmt(p, snap.decimals)}`, kind: "resistance" })),
    ...snap.intraday.support.map((p) => ({ price: p, label: `S ${fmt(p, snap.decimals)}`, kind: "support" })),
  ];
  if (snap.day.vwap) levels.push({ price: snap.day.vwap, label: `VWAP ${fmt(snap.day.vwap, snap.decimals)}`, kind: "level" });
  const overlays = closes.length >= 20 ? [{ label: "SMA20", color: OVER.sma20, points: smaSeries(closes, 20) }] : [];
  return chartScene(narration.intraday, [`${snap.name} intraday`], snap, c, { timeframe: "15m · Today", overlays, levels });
}
function dailyChart(snap, narration) {
  const c = snap.candles.daily;
  const closes = c.map((x) => x.c);
  const overlays = [];
  if (closes.length >= 20) overlays.push({ label: "SMA20", color: OVER.sma20, points: smaSeries(closes, 20) });
  if (closes.length >= 50) overlays.push({ label: "SMA50", color: OVER.sma50, points: smaSeries(closes, 50) });
  const levels = [
    ...snap.swing.majorResistance.slice(0, 2).map((p) => ({ price: p, label: `R ${fmt(p, snap.decimals)}`, kind: "resistance" })),
    ...snap.swing.majorSupport.slice(0, 2).map((p) => ({ price: p, label: `S ${fmt(p, snap.decimals)}`, kind: "support" })),
  ];
  return chartScene(narration.swing, [`${snap.name} trend`], snap, c, { timeframe: "Daily · 3M", overlays, levels });
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

  const sys = `${NARRATION_RULES}\nReturn ONLY JSON: {"title","description","hashtags":[6-8],"tags":[6-10],"hook","snapshot","intraday","swing","scenario","takeaway"}.`;
  const usr = `ASSET: ${snap.name} (${snap.pair})\nDATA:\n${snapshotText(snap)}\nTODAY'S HEADLINES:\n${headTxt}\n
Write: title (specific, e.g. "Gold Analysis Today: The Level That Decides the Trend"), description (SEO, 2-3 sentences), hashtags, tags,
hook (scroll-stopper), snapshot (price + move, spelled), intraday (explain today's session using VWAP + intraday levels), swing (the daily/higher-timeframe structure using the moving averages, RSI and major levels), scenario ("if it holds X … if it loses Y …" — framed as analysis, no advice), takeaway (mature closer + a soft "follow for tomorrow's breakdown").`;

  const g = (await callGroq(sys, usr)) || {};
  const dir = snap.changePct >= 0 ? "higher" : "lower";
  const n = {
    hook: g.hook || `${snap.name} is trading ${dir} today — here's exactly what the chart is telling us.`,
    snapshot: g.snapshot || `${snap.name} is ${dir} on the session, and the intraday picture is doing something worth watching.`,
    intraday: g.intraday || `On the intraday chart, ${snap.name} is trading around its VWAP with buyers and sellers fighting over the day's key levels.`,
    swing: g.swing || `Step back to the daily chart and the bigger structure shows a ${snap.swing.trend}, with the moving averages framing the trend.`,
    scenario: g.scenario || `Hold the major support and the structure stays constructive; lose it and the picture shifts. Watch the levels, not the noise.`,
    takeaway: g.takeaway || `That's today's read on ${snap.name}. Follow for tomorrow's breakdown.`,
  };

  const levelBullets = [
    `Resistance  ${snap.swing.majorResistance.slice(0, 2).map((x) => fmt(x, snap.decimals)).join("  /  ")}`,
    `Support  ${snap.swing.majorSupport.slice(0, 2).map((x) => fmt(x, snap.decimals)).join("  /  ")}`,
    `RSI ${snap.swing.rsi}  ·  Trend: ${snap.swing.trend}`,
  ];

  const lines = [
    { text: n.hook, keywords: [`${snap.name} markets`], layout: "center" },
    { text: n.snapshot, keywords: [`${snap.name} price`], layout: "countup", value: snap.price, prefix: snap.unit },
    intradayChart(snap, n),
    dailyChart(snap, n),
    { text: n.scenario, keywords: [`${snap.name} levels`], layout: "bullets", kicker: "KEY LEVELS", items: levelBullets },
    { text: n.takeaway, keywords: [`${snap.name} outlook`], layout: "center" },
  ];

  const defaultTags = ASSET === "gold"
    ? ["gold", "xauusd", "gold price", "gold analysis", "trading", "technical analysis", "markets", "investing"]
    : ["bitcoin", "btc", "crypto", "bitcoin analysis", "trading", "technical analysis", "markets", "investing"];
  const meta = buildMeta(cfg, {
    title: g.title, description: g.description, hashtags: g.hashtags, tags: g.tags && g.tags.length >= 3 ? g.tags : defaultTags,
    topic: `${snap.name} daily analysis`, thumb: { line1: snap.name, line2: "ANALYSIS", sub: `${snap.changePct >= 0 ? "+" : ""}${snap.changePct}% today` },
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

  const sys = `${NARRATION_RULES}\nThis is a WEEKEND educational deep-dive on a US stock (markets are closed). Mature, insightful, no hype. Return ONLY JSON: {"title","description","hashtags":[6-8],"tags":[6-10],"hook","business","facts":[3 short bullet strings],"chart","story","takeaway"}.`;
  const usr = `COMPANY: ${pick.name} (${pick.sym})\nPRICE DATA:\n${snapshotText(snap)}\nRECENT HEADLINES:\n${headTxt}\n
Write an advanced but accessible breakdown: hook, business (what the company actually does + why it matters), facts (3 crisp bullets a smart investor should know), chart (what the weekly chart structure shows — trend, moving averages, major levels, spelled numbers, no symbols), story (the current narrative/what to watch), takeaway (mature closer + soft "follow for the next breakdown"). No price targets or advice.`;

  const g = (await callGroq(sys, usr)) || {};
  const n = {
    hook: g.hook || `Everyone knows ${pick.name} — but here's what most people miss about it.`,
    business: g.business || `${pick.name} is one of the most important companies in the market, and its story is bigger than its stock price.`,
    facts: Array.isArray(g.facts) && g.facts.length >= 2 ? g.facts.slice(0, 4) : ["A market leader in its space", "Watched by every serious investor", "A stock that moves the whole index"],
    chart: g.chart || `On the weekly chart, ${pick.name} is in a ${snap.swing.trend}, with the moving averages framing the bigger trend.`,
    story: g.story || `The real question is what happens next — and the chart plus the fundamentals tell part of that story.`,
    takeaway: g.takeaway || `That's the deep-dive on ${pick.name}. Follow for the next breakdown.`,
  };

  const closes = snap.candles.daily.map((x) => x.c);
  const overlays = [];
  if (closes.length >= 50) overlays.push({ label: "SMA50", color: OVER.sma50, points: smaSeries(closes, 50) });
  if (closes.length >= 200) overlays.push({ label: "SMA200", color: OVER.sma200, points: smaSeries(closes, 200) });
  const levels = [
    ...snap.swing.majorResistance.slice(0, 2).map((p) => ({ price: p, label: `R ${fmt(p, 2)}`, kind: "resistance" })),
    ...snap.swing.majorSupport.slice(0, 2).map((p) => ({ price: p, label: `S ${fmt(p, 2)}`, kind: "support" })),
  ];

  const lines = [
    { text: n.hook, keywords: [`${pick.name} company`], layout: "center" },
    { text: n.business, keywords: [`${pick.name} business`], layout: "lower-third" },
    { text: n.facts.join(". ") + ".", keywords: [`${pick.name} facts`], layout: "bullets", kicker: pick.name.toUpperCase(), items: n.facts },
    chartScene(n.chart, [`${pick.name} chart`], snap, snap.candles.daily, { timeframe: "Daily · 1Y", overlays, levels }),
    { text: n.story, keywords: [`${pick.name} outlook`], layout: "center" },
    { text: n.takeaway, keywords: [`${pick.name} takeaway`], layout: "center" },
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
  if (MODE === "deepdive") await deepDive(cfg);
  else await marketReel(cfg);
  console.log(`Done. Render with: npm run batch -- --only=${CHANNEL}`);
}
main().catch((e) => { console.error("analysis_reel failed:", e.message); process.exit(1); });
