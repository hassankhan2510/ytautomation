// Shared helpers for the Studio web API (Vercel Node functions).
// Env (set in the Vercel dashboard — never in code):
//   STUDIO_PASSWORD        the password for the page
//   GITHUB_TOKEN           fine-grained token for the repo: Actions read+write, Contents read
//   GITHUB_REPO            owner/repo, e.g. hassankhan2510/ytautomation
//   BLOB_READ_WRITE_TOKEN  added automatically when a Blob store is connected to the project
//   BLOB_ACCESS            "private" (default) or "public" — must match the Blob store type
import crypto from "node:crypto";

export const REPO = process.env.GITHUB_REPO || "hassankhan2510/ytautomation";
export const WORKFLOW = "studio-web.yml";
export const ACCESS = process.env.BLOB_ACCESS === "public" ? "public" : "private";
const COOKIE = "studio_auth";
const DAYS = 30;

function key() {
  const p = process.env.STUDIO_PASSWORD;
  if (!p) throw new Error("STUDIO_PASSWORD is not set in Vercel");
  return crypto.createHash("sha256").update("studio-web:" + p).digest();
}

export function makeCookie() {
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", key()).update(ts).digest("base64url");
  return `${COOKIE}=${ts}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS * 86400}`;
}

export function isAuthed(req) {
  try {
    const raw = String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
    if (!raw) return false;
    const [ts, sig] = raw.slice(COOKIE.length + 1).split(".");
    if (!ts || !sig || Date.now() - Number(ts) > DAYS * 86400e3) return false;
    const want = crypto.createHmac("sha256", key()).update(ts).digest("base64url");
    return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
  } catch {
    return false;
  }
}

export function checkPassword(given) {
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(String(process.env.STUDIO_PASSWORD || "")).digest();
  return Boolean(process.env.STUDIO_PASSWORD) && crypto.timingSafeEqual(a, b);
}

export async function gh(path, init = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set in Vercel");
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// Whitelists — the workflow re-validates, but bad input is rejected here first.
export const CHOICES = {
  scriptMode: ["as-written", "ai-rewrite", "from-voiceover"],
  voice: ["upload", "mine", "mine-sufyan", "mine-pariya", "mine-sabeha", "omnivoice", "omnivoice-sufyan", "omnivoice-pariya", "omnivoice-sabeha", "kokoro", "edge", "none"],
  language: ["english", "urdu"],
  style: ["explainer", "techNews", "breakdown", "story", "buildInPublic"],
  theme: ["crimson", "ocean", "grape", "sunrise", "lagoon", "mango", "mint", "neon", "acid", "electric", "paper", "taxi"],
  channel: ["none", "cohort_zero"],
  backgrounds: ["video", "photo", "off"],
  music: ["auto", "none"],
  sfx: ["on", "off"],
};

export const safeId = (s) => /^[a-z0-9-]{6,40}$/.test(String(s || ""));

export function json(res, code, obj) {
  res.status(code).setHeader("Content-Type", "application/json").send(JSON.stringify(obj));
}
