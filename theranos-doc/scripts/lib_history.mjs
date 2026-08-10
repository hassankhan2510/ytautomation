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

// Normalize a topic/title for comparison: lowercase, drop years, strip punctuation, collapse spaces.
// So "Gold Price Today 2026" and "gold price today" collapse to the same key.
export function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(in\s+)?20\d\d\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// Recent titles (raw) used in the last `days` days — fed to the writer as "do not reuse these".
export function recentTitles(channel, days = 21) {
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
