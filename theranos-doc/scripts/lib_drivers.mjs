/**
 * MARKET DRIVERS — the "WHY" behind the price (all free, keyless).
 *
 * Price alone is a screensaver; price + catalyst is what a trader follows. This pulls the one data
 * point that actually drives each asset, so every reel can say why it's moving — desk-grade context
 * that almost no retail IG account shows:
 *   - GOLD → the US Dollar Index (DX-Y.NYB) + the 10-year Treasury yield (^TNX). Gold moves inverse
 *            to both: dollar down / yields down = tailwind; up = headwind.
 *   - BTC  → perp funding rate + open interest (Binance USDT-perp, Bybit fallback). Positive funding
 *            with rising OI = crowded, leveraged longs; negative = shorts paying, squeeze risk up.
 *
 * Every fetch is best-effort: any failure returns null and the reel falls back to price-only.
 */

const YF = "https://query1.finance.yahoo.com/v8/finance/chart/";

async function yfDaily(symbol, range = "1mo") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${YF}${encodeURIComponent(symbol)}?range=${range}&interval=1d`, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const d = await r.json();
    const res = d?.chart?.result?.[0];
    if (!res) throw new Error("no data");
    const closes = (res.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
    const price = res.meta?.regularMarketPrice ?? closes.at(-1);
    return { price, closes };
  } finally {
    clearTimeout(t);
  }
}

// % change over `back` sessions (5 ≈ one trading week).
function pctChange(closes, back) {
  if (!closes || closes.length <= back) return null;
  const now = closes.at(-1), then = closes.at(-1 - back);
  return then ? Number((((now - then) / then) * 100).toFixed(2)) : null;
}

/* ---------- GOLD: dollar + yields ---------- */
export async function goldDriver() {
  try {
    const dxy = await yfDaily("DX-Y.NYB", "1mo");
    const wk = pctChange(dxy.closes, 5);
    let yield10y = null;
    try { const tnx = await yfDaily("^TNX", "1mo"); yield10y = tnx.price != null ? Number(tnx.price.toFixed(2)) : null; } catch { /* optional */ }
    const dir = wk == null ? "flat" : wk < -0.1 ? "falling" : wk > 0.1 ? "rising" : "flat";
    // Gold is inverse to the dollar: a falling dollar is supportive, a rising dollar is a headwind.
    const bias = dir === "falling" ? "supportive" : dir === "rising" ? "headwind" : "neutral";
    return {
      kind: "gold",
      label: "Dollar Index (DXY)",
      value: dxy.price != null ? Number(dxy.price.toFixed(2)) : null,
      changePct: wk,
      direction: dir,
      yield10y,
      bias, // supportive | headwind | neutral (for gold)
    };
  } catch {
    return null;
  }
}

/* ---------- BTC: funding + open interest ---------- */
async function binanceDerivs() {
  const [f, o] = await Promise.all([
    fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT").then((r) => r.json()),
    fetch("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT").then((r) => r.json()),
  ]);
  return { funding: Number(f.lastFundingRate), oi: Number(o.openInterest), src: "Binance" };
}
async function bybitDerivs() {
  const d = await fetch("https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT").then((r) => r.json());
  const t = d?.result?.list?.[0];
  if (!t) throw new Error("no bybit data");
  return { funding: Number(t.fundingRate), oi: Number(t.openInterest), src: "Bybit" };
}
export async function btcDriver() {
  let d = null;
  try { d = await binanceDerivs(); } catch { try { d = await bybitDerivs(); } catch { return null; } }
  if (!d || d.funding == null || Number.isNaN(d.funding)) return null;
  const fundingPct = Number((d.funding * 100).toFixed(4)); // per funding interval (8h)
  const fundingAnnual = Number((d.funding * 3 * 365 * 100).toFixed(1)); // rough annualized
  // Positive funding = longs pay shorts (crowded long); negative = shorts pay (crowded short).
  const crowd = d.funding > 0.0001 ? "longs paying" : d.funding < -0.0001 ? "shorts paying" : "balanced";
  const bias = d.funding > 0.0004 ? "overheated-long" : d.funding < -0.0001 ? "squeeze-risk-up" : "healthy";
  return {
    kind: "btc",
    label: "Perp funding + OI",
    funding: d.funding,
    fundingPct,
    fundingAnnual,
    oi: d.oi != null ? Number(d.oi.toFixed(0)) : null,
    crowd, // longs paying | shorts paying | balanced
    bias, // overheated-long | squeeze-risk-up | healthy
    source: d.src,
  };
}

export async function driverFor(assetKey) {
  if (assetKey === "gold") return await goldDriver();
  if (assetKey === "btc") return await btcDriver();
  return null;
}

// CLI dry-check.
if (process.argv[1]?.endsWith("lib_drivers.mjs")) {
  Promise.all([goldDriver(), btcDriver()]).then(([g, b]) => {
    console.log("GOLD driver:", JSON.stringify(g, null, 2));
    console.log("BTC driver:", JSON.stringify(b, null, 2));
  });
}
