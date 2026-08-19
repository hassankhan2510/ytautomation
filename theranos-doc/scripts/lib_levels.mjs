/**
 * HERO LEVEL + ACCOUNTABILITY — the two things that turn a chart account into a followed one.
 *
 *  - heroLevel(snap): the ONE "line in the sand" price is reacting to right now, plus a bull path
 *    (above it → next resistance) and a bear path (below it → next support). This is the screenshot-able
 *    conviction number and the drawn bull/bear decision map.
 *  - the store (channels/levels/<channel>_<asset>.json): yesterday's hero level, so tomorrow's reel can
 *    OPEN with "I flagged X — here's what price did." A track record, not a fresh read every day.
 *
 * The store is committed back by the workflow so it persists across runs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const DIR = path.join(REPO, "channels", "levels");

const round = (x, d) => (x == null ? null : Number(Number(x).toFixed(d)));
const file = (channel, asset) => path.join(DIR, `${channel}_${asset}.json`);

export function loadLevels(channel, asset) {
  try { return JSON.parse(fs.readFileSync(file(channel, asset), "utf-8")); } catch { return []; }
}
export function saveLevel(channel, asset, entry) {
  fs.mkdirSync(DIR, { recursive: true });
  const arr = loadLevels(channel, asset).filter((e) => e.date !== entry.date); // replace same-day
  arr.push(entry);
  fs.writeFileSync(file(channel, asset), JSON.stringify(arr.slice(-90), null, 2));
}
export function lastEntryBefore(channel, asset, todayISO) {
  const arr = loadLevels(channel, asset);
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].date !== todayISO) return arr[i];
  return null;
}
export function todayISO() {
  // PKT calendar day (UTC+5) — we post in the morning PKT.
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Choose the single hero level + the decision map.
 * Bullish structure (above VWAP & 50-day): hero = the key support bulls must HOLD.
 * Bearish structure: hero = the key resistance bears must keep price under (bulls need to RECLAIM).
 * Range: hero = the nearest level either way.
 */
export function heroLevel(snap) {
  const s = snap.swing, price = snap.price, dec = snap.decimals;
  const atr = s.atr || price * 0.01;
  const below = [snap.day?.vwap, ...(s.majorSupport || []), ...(snap.timeframes?.h4?.support || []), ...(snap.timeframes?.daily?.support || [])]
    .filter((v) => v != null && v < price).sort((a, b) => b - a);
  const above = [...(s.majorResistance || []), ...(snap.timeframes?.h4?.resistance || []), ...(snap.timeframes?.daily?.resistance || [])]
    .filter((v) => v != null && v > price).sort((a, b) => a - b);
  const nearSup = below[0] ?? round(price - atr, dec);
  const nextSup = below[1] ?? round(nearSup - atr, dec);
  const nearRes = above[0] ?? round(price + atr, dec);
  const nextRes = above[1] ?? round(nearRes + atr, dec);

  const bullish = (snap.day?.vwap == null || price >= snap.day.vwap) && (s.sma50 == null || price >= s.sma50);
  const bearish = (snap.day?.vwap != null && price < snap.day.vwap) && (s.sma50 != null && price < s.sma50);

  let hero, side, sideText;
  if (bullish) { hero = nearSup; side = "hold-above"; sideText = "hold above"; }
  else if (bearish) { hero = nearRes; side = "reclaim-above"; sideText = "reclaim"; }
  else { // range → the closer level is the pivot
    const dS = price - nearSup, dR = nearRes - price;
    if (dS <= dR) { hero = nearSup; side = "hold-above"; sideText = "hold above"; }
    else { hero = nearRes; side = "reclaim-above"; sideText = "reclaim"; }
  }
  hero = round(hero, dec);

  // Decision map: above the hero → bulls run it to the next resistance; below → bears flush to next support.
  const bullTarget = round(above.find((v) => v > hero) ?? nearRes ?? hero + atr, dec);
  const bearTarget = round(below.find((v) => v < hero) ?? nextSup ?? hero - atr, dec);

  return {
    hero, side, sideText,
    bull: { trigger: hero, target: bullTarget },
    bear: { trigger: hero, target: bearTarget },
    structure: bullish ? "bullish" : bearish ? "bearish" : "range",
  };
}

// Grade yesterday's hero call against where price is today.
export function gradeYesterday(prev, snap) {
  if (!prev || prev.hero == null) return null;
  const price = snap.price;
  let verdict;
  if (prev.side === "hold-above") verdict = price >= prev.hero ? "held" : "lost";
  else if (prev.side === "reclaim-above") verdict = price >= prev.hero ? "reclaimed" : "still-capped";
  else verdict = price >= prev.hero ? "above" : "below";
  // OI momentum (BTC) if we stored it.
  let oiDelta = null;
  if (prev.driver && prev.driver.oi != null && snap.driver && snap.driver.oi != null && prev.driver.oi > 0) {
    oiDelta = Number((((snap.driver.oi - prev.driver.oi) / prev.driver.oi) * 100).toFixed(1));
  }
  return { hero: prev.hero, side: prev.side, verdict, prevPrice: prev.price, nowPrice: price, date: prev.date, oiDelta };
}
