/**
 * MARKET DATA + INDICATORS — the analytical core of the daily Gold/Bitcoin analysis reels.
 *
 * Pulls real OHLC candles from Yahoo Finance (free, keyless) at three timeframes and computes the
 * levels a real trader talks about — so the numbers on screen are guaranteed correct and the LLM only
 * writes the analysis AROUND them (never invents a price or a level).
 *
 *   - Day-trade view : 5-minute candles, last session      (VWAP, intraday support/resistance, day range)
 *   - Swing view     : daily candles, ~6 months            (SMA 20/50/200, RSI, ATR, trend, major S/R)
 *   - Weekly view    : weekly candles, ~2 years            (higher-timeframe trend + major levels)
 *
 * Gold uses GC=F (COMEX futures) — the free proxy for XAU/USD spot (tracks within a few dollars);
 * we display it as "GOLD · XAU/USD". Bitcoin uses BTC-USD.
 *
 *   node scripts/lib_market.mjs            # prints the live snapshot for Gold + Bitcoin (a dry check)
 */

export const ASSETS = {
  gold: { symbol: "GC=F", name: "GOLD", pair: "XAU/USD", unit: "$", decimals: 2 },
  btc: { symbol: "BTC-USD", name: "BITCOIN", pair: "BTC/USD", unit: "$", decimals: 0 },
};

const YF = "https://query1.finance.yahoo.com/v8/finance/chart/";

async function fetchCandles(symbol, range, interval) {
  const url = `${YF}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const d = await r.json();
    const res = d?.chart?.result?.[0];
    if (!res) throw new Error(d?.chart?.error?.description || "no data");
    const ts = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const meta = res.meta || {};
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if ([o, h, l, c].some((v) => v == null)) continue;
      candles.push({ t: ts[i] * 1000, o, h, l, c, v: q.volume?.[i] || 0 });
    }
    return { candles, meta };
  } finally {
    clearTimeout(t);
  }
}

/* ---------- indicators (pure JS, no libs) ---------- */
const sma = (v, p) => (v.length < p ? null : v.slice(-p).reduce((a, b) => a + b, 0) / p);
function ema(v, p) {
  if (v.length < p) return null;
  const k = 2 / (p + 1);
  let e = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < v.length; i++) e = v[i] * k + e * (1 - k);
  return e;
}
function rsi(closes, p = 14) {
  if (closes.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i - 1]; d >= 0 ? (g += d) : (l -= d); }
  g /= p; l /= p;
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}
function atr(candles, p = 14) {
  if (candles.length < p + 1) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], pc = candles[i - 1].c;
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)));
  }
  return sma(tr, p);
}
function vwap(candles) {
  let pv = 0, vol = 0;
  for (const c of candles) { const tp = (c.h + c.l + c.c) / 3; pv += tp * (c.v || 0); vol += c.v || 0; }
  return vol ? pv / vol : null;
}
// Pivot-based support/resistance: a swing high/low is an extreme vs `w` neighbours each side.
// Returns levels sorted by distance to the current price, split into support (below) / resistance (above).
function swingLevels(candles, w = 3) {
  const highs = [], lows = [];
  for (let i = w; i < candles.length - w; i++) {
    const s = candles.slice(i - w, i + w + 1);
    if (candles[i].h === Math.max(...s.map((x) => x.h))) highs.push(candles[i].h);
    if (candles[i].l === Math.min(...s.map((x) => x.l))) lows.push(candles[i].l);
  }
  return { highs, lows };
}
// Cluster nearby levels (within tol%) and keep the strongest, then pick nearest N around price.
function keyLevels(rawLevels, price, tolPct = 0.4, n = 3) {
  const tol = (price * tolPct) / 100;
  const sorted = [...rawLevels].sort((a, b) => a - b);
  const clustered = [];
  for (const lv of sorted) {
    const last = clustered[clustered.length - 1];
    if (last && Math.abs(lv - last) <= tol) continue;
    clustered.push(lv);
  }
  const support = clustered.filter((l) => l < price).sort((a, b) => b - a).slice(0, n);
  const resistance = clustered.filter((l) => l > price).sort((a, b) => a - b).slice(0, n);
  return { support, resistance };
}

// The candles belonging to the most recent trading day (for VWAP, intraday levels, day range).
function lastSession(candles) {
  if (!candles.length) return [];
  const day = new Date(candles.at(-1).t).toISOString().slice(0, 10);
  return candles.filter((c) => new Date(c.t).toISOString().slice(0, 10) === day);
}
// Prior day's close = the close of the last daily candle that isn't today (robust vs Yahoo's
// sometimes-wrong chartPreviousClose on futures).
function priorDailyClose(daily) {
  if (daily.length < 2) return null;
  const today = new Date(daily.at(-1).t).toISOString().slice(0, 10);
  for (let i = daily.length - 1; i >= 0; i--) {
    if (new Date(daily[i].t).toISOString().slice(0, 10) !== today) return daily[i].c;
  }
  return daily.at(-2).c;
}

function trendLabel(price, s20, s50, s200) {
  if (s50 && s200) {
    if (price > s50 && s50 > s200) return "uptrend";
    if (price < s50 && s50 < s200) return "downtrend";
  }
  if (s20 && price > s20) return "short-term up";
  if (s20 && price < s20) return "short-term down";
  return "range";
}

/* ---------- the snapshot ---------- */
export async function analyze(key) {
  const a = ASSETS[key];
  if (!a) throw new Error(`unknown asset ${key}`);
  const [intra, daily, weekly] = await Promise.all([
    fetchCandles(a.symbol, "5d", "15m").catch(() => ({ candles: [], meta: {} })),
    fetchCandles(a.symbol, "1y", "1d"),
    fetchCandles(a.symbol, "2y", "1wk").catch(() => ({ candles: [], meta: {} })),
  ]);

  const meta = daily.meta || {};
  const session = lastSession(intra.candles);
  const price = meta.regularMarketPrice ?? daily.candles.at(-1)?.c;
  const prevClose = priorDailyClose(daily.candles) ?? meta.chartPreviousClose ?? price;
  const changeAbs = price - prevClose;
  const changePct = prevClose ? (changeAbs / prevClose) * 100 : 0;

  const dCloses = daily.candles.map((c) => c.c);
  const s20 = sma(dCloses, 20), s50 = sma(dCloses, 50), s200 = sma(dCloses, 200);
  const dailySwings = swingLevels(daily.candles, 3);
  const majorLevels = keyLevels([...dailySwings.highs, ...dailySwings.lows], price, 0.6, 3);

  const intraSwings = session.length ? swingLevels(session, 3) : { highs: [], lows: [] };
  const intraLevels = session.length
    ? keyLevels([...intraSwings.highs, ...intraSwings.lows], price, 0.25, 2)
    : { support: [], resistance: [] };

  const wCloses = weekly.candles.map((c) => c.c);

  const round = (x) => (x == null ? null : Number(x.toFixed(a.decimals)));
  return {
    key, symbol: a.symbol, name: a.name, pair: a.pair, unit: a.unit, decimals: a.decimals,
    price: round(price), prevClose: round(prevClose), changeAbs: round(changeAbs),
    changePct: Number(changePct.toFixed(2)), direction: changeAbs >= 0 ? "up" : "down",
    day: {
      high: round(session.length ? Math.max(...session.map((c) => c.h)) : meta.regularMarketDayHigh ?? price),
      low: round(session.length ? Math.min(...session.map((c) => c.l)) : meta.regularMarketDayLow ?? price),
      vwap: round(vwap(session)),
    },
    intraday: { support: intraLevels.support.map(round), resistance: intraLevels.resistance.map(round) },
    swing: {
      sma20: round(s20), sma50: round(s50), sma200: round(s200),
      rsi: round(rsi(dCloses, 14)), atr: round(atr(daily.candles, 14)),
      trend: trendLabel(price, s20, s50, s200),
      weekRsi: round(rsi(wCloses, 14)),
      majorSupport: majorLevels.support.map(round), majorResistance: majorLevels.resistance.map(round),
    },
    // Raw candles for the chart engine (Phase 2). Trimmed to keep the job file lean.
    candles: {
      intraday: session.slice(-40), // last session (15m candles)
      daily: daily.candles.slice(-60),
      weekly: weekly.candles.slice(-52),
    },
  };
}

// CLI dry-check: print the live snapshot (without the raw candle arrays) for Gold + Bitcoin.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("lib_market.mjs")) {
  const show = (s) => { const { candles, ...rest } = s; return rest; };
  Promise.all([analyze("gold"), analyze("btc")])
    .then(([g, b]) => { console.log(JSON.stringify(show(g), null, 2)); console.log(JSON.stringify(show(b), null, 2)); })
    .catch((e) => { console.error("market snapshot failed:", e.message); process.exit(1); });
}
