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
import { driverFor } from "./lib_drivers.mjs";
import { heroLevel, gradeYesterday, lastEntryBefore, saveLevel, todayISO } from "./lib_levels.mjs";
import { groqJSON } from "./lib_groq.mjs";

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

// Day-of-week format rotation so the reel isn't the same 7-beat skeleton every day (predictable = skippable).
//   Monday    → "week ahead" (what I'm watching, key levels for the week)
//   Friday    → "week in review" (did my levels hold? — the accountability payoff)
//   Tue–Thu   → "day trade" (the hard intraday read)
// FORMAT=daytrade|weekahead|review forces it.
function pktWeekday() {
  return new Date(Date.now() + 5 * 3600 * 1000).getUTCDay(); // 0 Sun … 6 Sat
}
// WEEKLY=1 (the per-asset weekly cadence) forces the full weekly-PLAN framing regardless of weekday,
// so a Wednesday BTC run is a week plan + key levels, not an intraday day-trade recap.
const WEEKLY = process.env.WEEKLY === "1";
const FORMAT = (process.env.FORMAT || (WEEKLY ? "weekahead" : pktWeekday() === 1 ? "weekahead" : pktWeekday() === 5 ? "review" : "daytrade")).toLowerCase();

const OVER = { sma20: "#38bdf8", sma50: "#f5a623", sma200: "#a78bfa", vwap: "#facc15" };
// The date the reel is generated — shown on the chart so viewers know the analysis is time-stamped.
const DATE_LABEL = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Rotating "desk" palettes so the reels don't look identical every day. The accent recolours the VWAP
// line, level labels, the hero/decision map and the top hairline; the bg gives each reel its own tint.
// Candle up/down stay green/red (those carry meaning). Gold and BTC hash differently, so they differ.
const REEL_THEMES = [
  { name: "emerald", accent: "#10b981", bg: ["#0d1a16", "#081210", "#04080a"] },
  { name: "azure",   accent: "#3b82f6", bg: ["#0d1524", "#080e18", "#04070c"] },
  { name: "gold",    accent: "#f5a623", bg: ["#1a1408", "#120d06", "#0a0704"] },
  { name: "cyan",    accent: "#22d3ee", bg: ["#08191c", "#061214", "#04090c"] },
  { name: "violet",  accent: "#8b5cf6", bg: ["#150f24", "#0d0a18", "#07050d"] },
  { name: "indigo",  accent: "#6366f1", bg: ["#0f1024", "#0a0a18", "#05050d"] },
];
function pickReelTheme(asset) {
  const pin = process.env.REEL_THEME;
  if (pin) { const t = REEL_THEMES.find((x) => x.name === pin); if (t) return t; }
  const now = new Date();
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const id = String(asset);
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return REEL_THEMES[(h + day) % REEL_THEMES.length];
}

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

/* ---------- Groq (shared throttled client; deterministic fallback if it fails) ---------- */
// The markets reels guarantee every on-screen number comes from lib_market. Set GROQ_MODEL_ANALYSIS to
// pin narration to a grounded chat model (e.g. openai/gpt-oss-120b) even if GROQ_MODEL is an agentic
// system like groq/compound that could web-search and speak numbers that differ from the chart.
const ANALYSIS_MODEL = process.env.GROQ_MODEL_ANALYSIS || undefined;
const callGroq = (system, user) => groqJSON(system, user, { maxTokens: 1400, temperature: 0.5, model: ANALYSIS_MODEL });

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
function tfScene(snap, tfKey, tfLabel, text, callout, keywords, vwap = false, decision = null) {
  const tf = snap.timeframes[tfKey] || { candles: [], overlays: [], support: [], resistance: [] };
  const overlays = (tf.overlays || []).map((o) => ({
    label: `SMA${o.period}`, color: o.period >= 50 ? OVER.sma50 : OVER.sma20, points: o.points,
  }));
  // On the decision-map scene the drawn bull/bear zones ARE the story — keep raw S/R off it so it reads clean.
  const levels = decision ? [] : [
    ...tf.resistance.map((p) => ({ price: p, label: `R ${fmt(p, snap.decimals)}`, kind: "resistance" })),
    ...tf.support.map((p) => ({ price: p, label: `S ${fmt(p, snap.decimals)}`, kind: "support" })),
  ];
  if (!decision && vwap && snap.day.vwap) levels.push({ price: snap.day.vwap, label: `VWAP ${fmt(snap.day.vwap, snap.decimals)}`, kind: "level" });
  return {
    text, keywords, layout: "candles", callout,
    candles: tf.candles, overlays, levels, timeframe: tfLabel,
    pair: snap.pair, assetName: snap.name, priceNow: snap.price, changePct: snap.changePct, decimals: snap.decimals,
    dateLabel: DATE_LABEL,
    decision, // {hero, side, sideText, bull:{target}, bear:{target}} → drawn on the chart as a bull/bear map
    bg: snap.bg || null, // per-reel rotating background tint (set from the theme in marketReel/deepDive)
  };
}

/* ---------- meta ---------- */
function buildMeta(cfg, { title, description, hashtags, tags, topic, thumb, accent }, lineCount) {
  return {
    title: (title || topic).slice(0, 100),
    titleOptions: [], hashtags: hashtags && hashtags.length ? hashtags.slice(0, 12) : ["markets"],
    topic, niche: "finance", channel: CHANNEL, platform: "reel",
    targetSeconds: Math.max(30, Math.round(lineCount * 5)), fps: 30, style: "finance",
    voice: cfg.voice || "en-US-GuyNeural", kokoroVoice: cfg.kokoroVoice || "am_onyx",
    voiceRate: cfg.voiceRate || "+6%", language: "en",
    brand: cfg.brand || CHANNEL.toUpperCase(), tagline: cfg.tagline || "", links: cfg.links || null,
    disclaimer: cfg.disclaimer || "", thumbStyle: cfg.thumbStyle || "", thumb: thumb || null,
    pauseBetweenLinesSec: 0.15, accentColor: accent || cfg.accentColor || "#10b981",
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

/* ---------- catalyst (the WHY) + accountability (the track record) ---------- */
function catalystBeat(snap) {
  const dr = snap.driver;
  if (!dr) return { say: `The chart is only half the story — the macro driver behind it is what actually moves it.`, callout: null, line: "(no external driver available)" };
  if (dr.kind === "gold") {
    const dirWord = dr.direction === "falling" ? "rolling over" : dr.direction === "rising" ? "pushing higher" : "going sideways";
    const eff = dr.bias === "supportive" ? "a tailwind for gold" : dr.bias === "headwind" ? "a headwind for gold" : "roughly neutral for gold";
    const arrow = dr.changePct == null ? "" : dr.changePct < 0 ? "▼" : "▲";
    return {
      say: `The dollar is ${dirWord} this week, which is ${eff} — gold trades inverse to the dollar, so that's the real driver behind the move, not just the candles.`,
      callout: dr.changePct != null ? `DXY ${arrow}${Math.abs(dr.changePct)}% → gold ${dr.bias === "supportive" ? "bid" : dr.bias === "headwind" ? "capped" : "mixed"}` : `Dollar is the driver`,
      line: `Dollar Index ${dr.value ?? "n/a"} (${dr.changePct == null ? "n/a" : (dr.changePct >= 0 ? "+" : "") + dr.changePct + "% wk"}), 10-year yield ${dr.yield10y ?? "n/a"} → ${dr.bias} for gold`,
    };
  }
  const crowdWord = dr.crowd === "longs paying" ? "leveraged longs are crowding in" : dr.crowd === "shorts paying" ? "shorts are paying up, so squeeze risk is higher" : "positioning is balanced";
  const oiTxt = dr.oi != null ? Math.round(dr.oi).toLocaleString() : "elevated";
  return {
    say: `Perp funding shows ${crowdWord}, and open interest tells you how much leverage is riding on this — that's the fuel behind the candles that price-only charts never show you.`,
    callout: `Funding ${dr.fundingPct}%/8h · OI ${oiTxt}`,
    line: `Funding ${dr.fundingPct}%/8h (~${dr.fundingAnnual}% ann), OI ${dr.oi ?? "n/a"} BTC, ${dr.crowd} → ${dr.bias} (${dr.source})`,
  };
}

function accountabilityBeat(snap, grade) {
  if (!grade) return { say: null, callout: null, line: "(no prior level on record yet)" };
  const v = grade.verdict;
  const ok = v === "held" || v === "reclaimed" || v === "above";
  const verdictText = v === "held" ? "held it, so the structure I flagged stayed intact"
    : v === "lost" ? "lost it, which flips the near-term structure I was watching"
    : v === "reclaimed" ? "reclaimed it, which turns the near-term structure back up"
    : v === "still-capped" ? "is still capped below it, so the sellers keep the edge"
    : v === "above" ? "is holding above it" : "slipped below it";
  return {
    say: `Yesterday I drew a line in the sand — and price ${verdictText}. That's the track record; now here's today's read.`,
    callout: `Yesterday: ${snap.unit}${fmt(grade.hero, snap.decimals)} ${ok ? "held ✓" : "lost ✗"}`,
    line: `Prev hero ${grade.hero} (${grade.side}) → ${v}${grade.oiDelta != null ? `; OI ${grade.oiDelta >= 0 ? "+" : ""}${grade.oiDelta}%` : ""}`,
  };
}

/* ---------- WEEKDAY: market analysis reel (driver + accountability + hero + decision map + rotation) ---------- */
async function marketReel(cfg) {
  const snap = await analyze(ASSET);
  const reelTheme = pickReelTheme(ASSET);
  snap.bg = reelTheme.bg;
  snap.driver = await driverFor(ASSET).catch(() => null);
  const heads = await news(`${snap.name} price today`, 3).catch(() => []);
  const headTxt = heads.map((h) => `- ${h.extract}`).join("\n") || "(no fresh headlines)";

  const u = snap.unit;
  const s = snap.swing, d = snap.day;
  const rsiState = s.rsi >= 70 ? "overbought" : s.rsi <= 30 ? "oversold" : s.rsi >= 60 ? "strong" : s.rsi <= 40 ? "weak" : "neutral";
  const vwapRel = d.vwap != null ? (snap.price >= d.vwap ? "above" : "below") : "near";
  const ma50Rel = s.sma50 != null ? (snap.price >= s.sma50 ? "above" : "below") : "n/a";
  const ma200Rel = s.sma200 != null ? (snap.price >= s.sma200 ? "above" : "below") : "n/a";

  // Hero level + decision map, and grade yesterday's call.
  const hl = heroLevel(snap);
  const prev = lastEntryBefore(CHANNEL, ASSET, todayISO());
  const grade = gradeYesterday(prev ? { ...prev } : null, snap);
  const cat = catalystBeat(snap);
  const acct = accountabilityBeat(snap, grade);

  const taContext = [
    `Price ${vwapRel} VWAP (${fmt(d.vwap, snap.decimals)})`,
    `RSI ${s.rsi} = ${rsiState}`,
    `Price ${ma50Rel} the 50-day MA and ${ma200Rel} the 200-day MA`,
    `ATR ${s.atr} = expected daily range`,
    `Daily trend: ${s.trend}`,
    `DRIVER (the why): ${cat.line}`,
    `HERO LEVEL (the one line that matters today): ${u}${fmt(hl.hero, snap.decimals)} — bias: ${hl.sideText} · structure ${hl.structure}`,
    `DECISION MAP: above ${u}${fmt(hl.hero, snap.decimals)} → bulls target ${u}${fmt(hl.bull.target, snap.decimals)}; below → bears target ${u}${fmt(hl.bear.target, snap.decimals)}`,
    `ACCOUNTABILITY (yesterday): ${acct.line}`,
  ].join("\n");

  const formatBrief = {
    daytrade: `FORMAT = DAY TRADE (midweek). A fast, hard intraday read. Open with the accountability callback if present, then the catalyst (the WHY), the intraday and 4-hour structure, the swing read, and finish on the DECISION MAP (the hero level + bull/bear paths).`,
    weekahead: `FORMAT = WEEKLY PLAN. "Here's my full plan and the key levels for the week." Give a complete multi-timeframe TECHNICAL plan: the weekly/daily structure, the ONE hero level that defines the week, the key support/resistance zones to trade around, and the macro driver/catalyst to watch. Bull path and bear path for the week. Minimal intraday noise; do not tie it to a specific weekday.`,
    review: `FORMAT = WEEK IN REVIEW (Friday). "Did my levels hold?" Lead HARD on the accountability callback, recap what the driver did this week, then set the ONE level that matters into next week via the decision map.`,
  }[FORMAT] || "";

  const sys = `${TA_RULES}\n${formatBrief}\nReturn ONLY JSON: {"title","description","hashtags":[6-8],"tags":[6-10],"beats":{"accountability":{"say","callout"},"catalyst":{"say","callout"},"intraday":{"say","callout"},"structure":{"say","callout"},"swing":{"say","callout"},"weekly":{"say","callout"},"decision":{"say","callout"}}}.
Each "say" = 1-2 spoken sentences (spell numbers as words, NO $ or % in "say"). Each "callout" = 2-6 words or a level for the SCREEN ($ and % are fine in callout).
KEY RULES:
- "accountability": open by grading yesterday's hero level from the ACCOUNTABILITY line (skip gracefully if none on record).
- "catalyst": explain WHY it's moving using the DRIVER line — connect price to the dollar (gold) or funding/OI (BTC). This is what makes you sound like a desk.
- "decision": the money beat — an if/then map around the ONE hero level: "${hl.sideText} ${u}${fmt(hl.hero, snap.decimals)} → bulls run it to ${u}${fmt(hl.bull.target, snap.decimals)}; lose it → ${u}${fmt(hl.bear.target, snap.decimals)}". Analysis, not advice.
- Hammer the ONE hero level; don't bury the reader in six levels.`;
  const usr = `ASSET: ${snap.name} (${snap.pair})\nCHART DATA:\n${snapshotText(snap)}\nTECHNICAL READ:\n${taContext}\nTODAY'S HEADLINES:\n${headTxt}\n
Write a HARD multi-timeframe technical breakdown as spoken beats + short on-screen callouts, following the FORMAT. Reference the real levels/VWAP/MAs/RSI/DRIVER/HERO above. Also a specific title, SEO description, hashtags, tags.`;

  const g = (await callGroq(sys, usr)) || {};
  const b = g.beats || {};
  const beat = (k, say, callout) => ({ say: (b[k] && b[k].say) || say, callout: (b[k] && b[k].callout) || callout });
  const pct = `${snap.changePct >= 0 ? "+" : ""}${snap.changePct}%`;
  const heroTxt = `${u}${fmt(hl.hero, snap.decimals)}`;
  const control = vwapRel === "above" ? "buyers" : "sellers";

  // Deterministic fallbacks (used only if Groq is down) — reference the real reads + driver + hero.
  const B = {
    accountability: beat("accountability",
      acct.say || `${snap.name} is ${rsiState} and trading ${vwapRel} its intraday average — here's the full read, and the one level that decides today.`,
      acct.callout || `${snap.name} · full read`),
    catalyst: beat("catalyst", cat.say, cat.callout),
    intraday: beat("intraday", `On the one-hour, price versus the volume-weighted average keeps ${control} in control — reclaiming it stays constructive, losing it rolls the intraday trend over.`, `1H · ${vwapRel} VWAP`),
    structure: beat("structure", `The four-hour ${s.trend.includes("up") ? "is holding higher lows, so momentum sits with the bulls" : "is pressing lower highs, so momentum sits with the bears"} short term.`, `4H · ${s.trend}`),
    swing: beat("swing", `On the daily, price is ${ma50Rel} the fifty-day and ${ma200Rel} the two-hundred-day with relative strength ${rsiState} — that frames how stretched the move is.`, `RSI ${s.rsi} · ${rsiState}`),
    weekly: beat("weekly", `On the weekly, the higher-timeframe trend is what swing traders lean on — that's the backdrop every intraday move plays inside of.`, `Weekly · ${s.trend}`),
    decision: beat("decision", `Here's the map: ${hl.sideText} the line and buyers can run it into the upper zone; lose it and sellers flush it into the lower zone. One level decides the session.`, `Line in the sand ${heroTxt}`),
  };

  // Compose scenes by format. The decision-map scene carries the drawn bull/bear payload.
  const decScene = (label) => tfScene(snap, FORMAT === "weekahead" || FORMAT === "review" ? "daily" : "h4", label, B.decision.say, B.decision.callout, [`${snap.name} levels`], false, hl);
  let lines;
  if (FORMAT === "weekahead") {
    lines = [
      tfScene(snap, "weekly", "Week Ahead", B.accountability.say, B.accountability.callout, [`${snap.name} week ahead`]),
      tfScene(snap, "daily", "The Driver", B.catalyst.say, B.catalyst.callout, [`${snap.name} macro`]),
      tfScene(snap, "weekly", "Weekly · Structure", B.weekly.say, B.weekly.callout, [`${snap.name} weekly`]),
      tfScene(snap, "daily", "Daily · Setup", B.swing.say, B.swing.callout, [`${snap.name} daily`]),
      decScene("The Level For The Week"),
    ];
  } else if (FORMAT === "review") {
    lines = [
      tfScene(snap, "daily", "Week In Review", B.accountability.say, B.accountability.callout, [`${snap.name} review`]),
      tfScene(snap, "daily", "What Drove It", B.catalyst.say, B.catalyst.callout, [`${snap.name} macro`]),
      tfScene(snap, "h4", "4H · Structure Now", B.structure.say, B.structure.callout, [`${snap.name} 4h`]),
      tfScene(snap, "weekly", "Weekly · Backdrop", B.weekly.say, B.weekly.callout, [`${snap.name} weekly`]),
      decScene("The Level Into Next Week"),
    ];
  } else {
    lines = [
      tfScene(snap, "daily", "Today's Read", B.accountability.say, B.accountability.callout, [`${snap.name} chart`]),
      tfScene(snap, "daily", "The Driver", B.catalyst.say, B.catalyst.callout, [`${snap.name} macro`]),
      tfScene(snap, "h1", "1H · Intraday", B.intraday.say, B.intraday.callout, [`${snap.name} intraday`], true),
      tfScene(snap, "h4", "4H · Structure", B.structure.say, B.structure.callout, [`${snap.name} 4h`]),
      tfScene(snap, "daily", "Daily · Swing", B.swing.say, B.swing.callout, [`${snap.name} daily`]),
      decScene("The Line In The Sand"),
    ];
  }

  const defaultTags = ASSET === "gold"
    ? ["gold", "xauusd", "gold price", "gold analysis", "trading", "technical analysis", "markets", "investing"]
    : ["bitcoin", "btc", "crypto", "bitcoin analysis", "trading", "technical analysis", "markets", "investing"];
  const fmtLabel = FORMAT === "weekahead" ? "WEEK AHEAD" : FORMAT === "review" ? "WEEK IN REVIEW" : "ANALYSIS";
  const meta = buildMeta(cfg, {
    title: g.title, description: g.description, hashtags: g.hashtags, tags: g.tags && g.tags.length >= 3 ? g.tags : defaultTags,
    topic: `${snap.name} ${FORMAT} analysis`, thumb: { line1: snap.name, line2: fmtLabel, sub: `${pct} today` }, accent: reelTheme.accent,
  }, lines.length);

  writeJob(`${CHANNEL}_${ASSET}`, meta, lines, heads);
  console.log(`  reel theme: ${reelTheme.name} (${reelTheme.accent})`);

  // Record today's hero level so tomorrow's reel can grade it (the track record).
  saveLevel(CHANNEL, ASSET, {
    date: todayISO(), hero: hl.hero, side: hl.side, price: snap.price, structure: hl.structure,
    bullTarget: hl.bull.target, bearTarget: hl.bear.target,
    driver: snap.driver ? { kind: snap.driver.kind, oi: snap.driver.oi ?? null, dxy: snap.driver.value ?? null } : null,
  });
  console.log(`  hero ${heroTxt} (${hl.side}) | driver ${snap.driver ? snap.driver.label : "none"} | format ${FORMAT}${grade ? ` | graded yesterday: ${grade.verdict}` : ""}`);
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
  const reelTheme = pickReelTheme(pick.sym);
  snap.bg = reelTheme.bg;
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
    topic: `${pick.name} stock deep dive`, thumb: { line1: pick.name.toUpperCase(), line2: "EXPLAINED", sub: "What investors watch" }, accent: reelTheme.accent,
  }, lines.length);

  writeJob(`${CHANNEL}_deepdive`, meta, lines, heads);
  console.log(`  reel theme: ${reelTheme.name} (${reelTheme.accent})`);
  appendHistory(CHANNEL, { topic: pick.name, title: meta.title });
}

async function main() {
  const cfg = loadConfig();
  console.log(`analysis_reel | channel ${CHANNEL} | mode ${MODE}${MODE === "analysis" ? ` | asset ${ASSET} | format ${FORMAT}` : ""}`);
  console.log(`Groq: key ${GROQ_API_KEY ? "SET" : "MISSING"} | model ${GROQ_MODEL}`);
  if (MODE === "deepdive") await deepDive(cfg);
  else await marketReel(cfg);
  console.log(`Done. Render with: npm run batch -- --only=${CHANNEL}`);
}
main().catch((e) => { console.error("analysis_reel failed:", e.message); process.exit(1); });
