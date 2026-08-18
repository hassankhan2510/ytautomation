/**
 * LINKEDIN SOURCE + DEDUP (Phase 1 of the personal-brand studio).
 *
 * Picks ONE fresh subject per run — a breakout GitHub repo OR a recent arXiv paper, NEVER mixed —
 * that hasn't been posted before, and writes an enriched brief for the content + graphics stages.
 *
 * Dedup: channels/li_history.json records every posted subject id. This stage only READS it (the
 * post stage appends after a successful post, so a failed run never burns a subject).
 * Alternation: repo / paper alternate by run so the feed varies but each post stays single-subject.
 *
 *   GITHUB_TOKEN=xxx node scripts/li_source.mjs            # writes li/subject.json
 *   node scripts/li_source.mjs --kind=repo|paper           # force a kind
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const LI_DIR = path.join(ROOT, "li");
const HISTORY = path.join(REPO, "channels", "li_history.json");

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const FORCE_KIND = arg("kind", "");
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

function daysAgoISO(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

async function fetchJSON(url, ms = 15000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "li-studio" };
    if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;
    const r = await fetch(url, { signal: ctrl.signal, headers });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function fetchText(url, ms = 20000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "li-studio" } }); return r.ok ? await r.text() : ""; }
  finally { clearTimeout(t); }
}

/* ---------- history (read only here) ---------- */
function loadHistory() { try { const a = JSON.parse(fs.readFileSync(HISTORY, "utf-8")); return Array.isArray(a) ? a : []; } catch { return []; } }

/* ---------- GitHub breakout repos ---------- */
// Junk we don't want as a "product" post: lists, courses, books, dotfiles, etc.
const REPO_BLOCK = /awesome|\bbook\b|roadmap|tutorial|\bcourse\b|interview|cheat.?sheet|dotfiles|\bresources?\b|\blist\b|handbook|notes|examples?$/i;
async function fetchRepos() {
  const map = (items) => items
    .filter((x) => x.description && x.language && !x.fork && !REPO_BLOCK.test(`${x.full_name} ${x.description}`))
    .map((x) => ({
      kind: "repo", id: x.full_name, title: x.name, url: x.html_url, stars: x.stargazers_count,
      language: x.language, topics: x.topics || [], description: x.description, createdAt: x.created_at,
    }));
  const query = async (days, minStars) => {
    const q = `created:>${daysAgoISO(days)} stars:>${minStars}`;
    const d = await fetchJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=40`);
    return map(d.items || []);
  };
  // Prefer genuinely NEW breakouts (born this week/fortnight), NOT old repos with big star counts.
  // Widen the window only if the fresh pool is too thin. The tightest (newest) window comes first.
  const windows = [[14, 250], [30, 500], [90, 1000]];
  const seen = new Set();
  const pool = [];
  for (const [days, minStars] of windows) {
    for (const it of await query(days, minStars)) if (!seen.has(it.id)) { seen.add(it.id); pool.push(it); }
    if (pool.length >= 12) break;
  }
  return pool;
}
async function enrichRepo(s) {
  try {
    const r = await fetchJSON(`https://api.github.com/repos/${s.id}/readme`);
    if (r && r.content) s.readme = Buffer.from(r.content, "base64").toString("utf-8").replace(/<[^>]+>/g, " ").slice(0, 4500);
  } catch { /* readme optional */ }
  return s;
}

/* ---------- arXiv recent papers ---------- */
// Bias toward broadly-interesting frontier topics (not ultra-theoretical), for a general tech audience.
const PAPER_BOOST = /\b(llm|language model|gpt|agent|reasoning|transformer|diffusion|multimodal|rag|retrieval|fine[- ]?tun|inference|attention|robot|vision|generat|foundation model|reinforcement|alignment|scaling|world model|neural)\b/i;
function decodeEntities(s) { return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'); }
async function fetchPapers() {
  const url = "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=50";
  const xml = await fetchText(url);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const out = [];
  for (const e of entries) {
    const g = (tag) => (e.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1];
    const title = decodeEntities((g("title") || "").replace(/\s+/g, " ").trim());
    const idUrl = (g("id") || "").trim();
    const summary = decodeEntities((g("summary") || "").replace(/\s+/g, " ").trim());
    const authors = [...e.matchAll(/<name>(.*?)<\/name>/g)].map((m) => m[1]).slice(0, 6);
    if (!title || !idUrl) continue;
    out.push({ kind: "paper", id: idUrl.split("/abs/").pop(), title, url: idUrl.replace("http:", "https:"), abstract: summary, authors });
  }
  // Rank: broad-interest boost first, then keep a readable title length.
  return out
    .map((p) => ({ p, s: (PAPER_BOOST.test(`${p.title} ${p.abstract}`) ? 2 : 0) + (p.title.split(" ").length <= 16 ? 1 : 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}

async function main() {
  fs.mkdirSync(LI_DIR, { recursive: true });
  const hist = loadHistory();
  const seen = new Set(hist.map((h) => String(h.id)));

  const [repos, papers] = await Promise.all([
    fetchRepos().catch((e) => { console.log(`  ! github failed (${e.message})`); return []; }),
    fetchPapers().catch((e) => { console.log(`  ! arxiv failed (${e.message})`); return []; }),
  ]);
  const freshRepos = repos.filter((r) => !seen.has(r.id));
  const freshPapers = papers.filter((p) => !seen.has(p.id));
  console.log(`  found ${freshRepos.length} fresh repos, ${freshPapers.length} fresh papers (of ${repos.length}/${papers.length})`);

  // Alternate repo/paper by post count so the feed varies; force via --kind.
  const preferRepo = FORCE_KIND ? FORCE_KIND === "repo" : hist.length % 2 === 0;
  let subject = preferRepo ? (freshRepos[0] || freshPapers[0]) : (freshPapers[0] || freshRepos[0]);
  if (!subject) { console.error("No fresh subject found (all recent ones already posted)."); process.exit(1); }
  if (subject.kind === "repo") await enrichRepo(subject);

  fs.writeFileSync(path.join(LI_DIR, "subject.json"), JSON.stringify(subject, null, 2));
  console.log(`\nChosen (${subject.kind}): ${subject.title}`);
  console.log(`  ${subject.kind === "repo" ? `${subject.id}  ${subject.stars}* ${subject.language}` : subject.id}`);
  console.log(`  ${(subject.description || subject.abstract || "").slice(0, 120)}`);
  console.log(`  -> li/subject.json`);
}
main().catch((e) => { console.error("li_source failed:", e.message); process.exit(1); });
