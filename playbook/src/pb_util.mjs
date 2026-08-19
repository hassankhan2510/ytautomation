/**
 * Shared helpers for the Playbook Studio: run paths, the One-Spine load/save, resilient fetch, logging.
 * The whole pipeline is stateless between phases EXCEPT for one file — runs/<id>/book.json (the Spine).
 * Every phase reads it, fills in its fields, validates, and saves. That is what makes the run resumable
 * and coherent across a 2-hour, 60-page job.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PB_ROOT = path.resolve(__dirname, "..");
export const RUNS = path.join(PB_ROOT, "runs");

export function slug(s) {
  return String(s || "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "book";
}

export function runPaths(id) {
  const dir = path.join(RUNS, id);
  return {
    dir,
    spine: path.join(dir, "book.json"),
    budget: path.join(dir, "llm_budget.json"),
    graphics: path.join(dir, "graphics"),
    html: path.join(dir, "book.html"),
    pdf: path.join(dir, `${id}.pdf`),
    log: path.join(dir, "run.log"),
  };
}

export function ensureRun(id) {
  const p = runPaths(id);
  fs.mkdirSync(p.dir, { recursive: true });
  fs.mkdirSync(p.graphics, { recursive: true });
  return p;
}

export function loadSpine(id) {
  const p = runPaths(id);
  if (!fs.existsSync(p.spine)) throw new Error(`No Spine at ${p.spine} — run an earlier phase first.`);
  return JSON.parse(fs.readFileSync(p.spine, "utf-8"));
}
export function saveSpine(id, spine) {
  const p = runPaths(id);
  fs.mkdirSync(p.dir, { recursive: true });
  fs.writeFileSync(p.spine, JSON.stringify(spine, null, 2));
}

export function log(msg) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  console.log(line);
}

/* ---------- resilient network ---------- */
export async function fetchText(url, { ms = 20000, headers = {}, tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (playbook-studio)", ...headers } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    } finally { clearTimeout(t); }
  }
  return "";
}
export async function fetchJSON(url, opts = {}) { return JSON.parse(await fetchText(url, opts)); }

/* ---------- text hygiene ---------- */
export function stripHtml(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
export function sentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- arg parsing ---------- */
export function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=").slice(1).join("=");
  if (process.argv.includes(`--${name}`)) return true;
  return def;
}
