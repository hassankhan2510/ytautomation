/**
 * CROSS-DAY POSTING HISTORY — so the daily auto-runs never repeat a topic or a title.
 *
 * One file per channel:  channels/history/<channel>.json  =  [{ date, topic, title }]
 * The scout reads it to drop topics used in the last N days; the writer reads it to avoid
 * re-using recent titles; both the writer AND the daily workflow append + commit it back, so
 * the memory survives GitHub Actions' ephemeral checkouts.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const DIR = path.join(REPO, "channels", "history");

export function historyPath(channel) {
  return path.join(DIR, `${String(channel).toLowerCase()}.json`);
}

export function loadHistory(channel) {
  try {
    const arr = JSON.parse(fs.readFileSync(historyPath(channel), "utf-8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Tokenize for comparison: lowercase, drop years, strip punctuation, remove stop/filler words, and
// LIGHT-STEM (crash/crashing/crashes -> crash) so wording variants collapse. This is what catches
// same-family near-dupes ("S&P 500 crash today" ~ "the S and P 500 is crashing") that the old
// year-only normalizer let through on consecutive days.
const STOP = new Set(
  ("the a an of to in on for with is are was were be been being and or but its it into about how why " +
    "what when where who which this that these those you your yours my his her their our we they he she " +
    "as at by from do does did will would can could should may might must not no yes vs versus explained " +
    "guide best top new now today real truth thing things video short reel your").split(/\s+/),
);
const KEEP = new Set(["ai", "vc", "ev", "ml", "ar", "vr", "ip", "pe", "hr", "gp"]); // short but meaningful
function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(in\s+)?20\d\d\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/(ing|ed|es|s)$/, "")) // light stem
    .filter((w) => w && (w.length >= 3 || KEEP.has(w)) && !STOP.has(w));
}
// A stable signature string: the unique tokens, sorted. Exact-equal signatures = same topic family.
export function normKey(s) {
  return [...new Set(tokens(s))].sort().join(" ");
}
// Token SET + Jaccard overlap, for fuzzy "how close are these two topics" checks.
export function sig(s) {
  return new Set(tokens(s));
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function withinDays(dateStr, days) {
  if (!days) return true;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= days * 86400000;
}

// Set of normalized topic keys used in the last `days` days.
export function recentTopicKeys(channel, days = 14) {
  return new Set(
    loadHistory(channel)
      .filter((e) => withinDays(e.date, days))
      .map((e) => normKey(e.topic))
      .filter(Boolean),
  );
}

// Fuzzy version: the token SETS of recently-used topic+title, for Jaccard "too similar" checks.
export function recentSigs(channel, days = 30) {
  return loadHistory(channel)
    .filter((e) => withinDays(e.date, days))
    .map((e) => ({ entry: e, s: sig(`${e.topic || ""} ${e.title || ""}`) }))
    .filter((x) => x.s.size);
}

// Is this candidate (title/topic) a repeat of something posted in the last `days` days? Returns the
// matching history entry (so callers can log what it collided with) or null. Catches both exact
// family matches (same signature) and near-dupes (Jaccard >= threshold).
export function isDuplicate(channel, cand, { days = 30, threshold = 0.6 } = {}) {
  const text = `${cand.topic || ""} ${cand.title || ""}`;
  const candKey = normKey(text);
  const candSig = sig(text);
  if (!candSig.size) return null;
  for (const { entry, s } of recentSigs(channel, days)) {
    if (candKey && candKey === normKey(`${entry.topic || ""} ${entry.title || ""}`)) return entry;
    if (jaccard(candSig, s) >= threshold) return entry;
  }
  return null;
}

// Recent titles (raw) used in the last `days` days — fed to the writer as "do not reuse these".
export function recentTitles(channel, days = 45) {
  return loadHistory(channel)
    .filter((e) => withinDays(e.date, days))
    .map((e) => e.title)
    .filter(Boolean);
}

// Append one entry (topic + final title) and keep the file bounded.
export function appendHistory(channel, { topic, title }) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const list = loadHistory(channel);
    list.push({ date: new Date().toISOString().slice(0, 10), topic: String(topic || ""), title: String(title || "") });
    fs.writeFileSync(historyPath(channel), JSON.stringify(list.slice(-400), null, 2));
    console.log(`  ~ history: recorded "${String(title || topic).slice(0, 60)}" for ${channel}`);
  } catch (e) {
    console.log(`  ! history append skipped (${e.message})`);
  }
}
