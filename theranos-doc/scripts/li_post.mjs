/**
 * LINKEDIN POST (Phase 5): publish the carousel PDF as a DOCUMENT post to your PERSONAL profile,
 * then add the source link as the first comment (keeps the feed-suppressed link out of the body),
 * then record the subject in channels/li_history.json so it's never posted again.
 *
 * Auth (env): LI_ACCESS_TOKEN (a member token with w_member_social). LI_PERSON_URN optional — else
 * derived from the token via /v2/userinfo. Non-fatal + gated: no-ops without a token; --dry prints only.
 *
 *   node scripts/li_post.mjs            # publishes (needs LI_ACCESS_TOKEN)
 *   node scripts/li_post.mjs --dry      # prints the caption + plan, posts nothing
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const POST = path.join(ROOT, "li", "post.json");
const PDF = path.join(ROOT, "out", "li_carousel.pdf");
const HISTORY = path.join(REPO, "channels", "li_history.json");

const DRY = process.argv.includes("--dry");
// LinkedIn-Version (YYYYMM). LinkedIn only keeps versions active ~12 months, so this needs bumping
// periodically — override with the LI_VERSION env/var if it 426s ("NONEXISTENT_VERSION").
const VERSION = process.env.LI_VERSION || "202606";
const API = "https://api.linkedin.com/rest";
const TOKEN = process.env.LI_ACCESS_TOKEN || "";

function skip(m) { console.log(`linkedin post skipped: ${m}`); process.exit(0); }
function headers(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, "LinkedIn-Version": VERSION, "X-Restli-Protocol-Version": "2.0.0", ...extra };
}

async function personUrn() {
  if (process.env.LI_PERSON_URN) {
    const raw = process.env.LI_PERSON_URN;
    return /^urn:li:person:/.test(raw) ? raw : `urn:li:person:${raw}`;
  }
  const r = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await r.json();
  if (!j.sub) throw new Error(`userinfo: ${JSON.stringify(j).slice(0, 160)}`);
  return `urn:li:person:${j.sub}`;
}

async function uploadDocument(owner, file) {
  const init = await fetch(`${API}/documents?action=initializeUpload`, {
    method: "POST", headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const ij = await init.json();
  const v = ij.value;
  if (!init.ok || !v?.document || !v?.uploadUrl) throw new Error(`doc init: ${init.status} ${JSON.stringify(ij).slice(0, 220)}`);
  const put = await fetch(v.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" }, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error(`doc upload: ${put.status}`);
  return v.document;
}

async function createPost(author, commentary, docUrn, title) {
  const res = await fetch(`${API}/posts`, {
    method: "POST", headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      author, commentary, visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: docUrn, title: String(title || "Carousel").slice(0, 100) } },
      lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    }),
  });
  if (res.status !== 201) throw new Error(`create post: ${res.status} ${(await res.text()).slice(0, 260)}`);
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
}

async function comment(author, postUrn, text) {
  try {
    await fetch(`${API}/socialActions/${encodeURIComponent(postUrn)}/comments`, {
      method: "POST", headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ actor: author, message: { text } }),
    });
  } catch { /* comment is best-effort */ }
}

function appendHistory(entry) {
  try {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(HISTORY, "utf-8")); if (!Array.isArray(list)) list = []; } catch { /* new */ }
    list.push({ date: new Date().toISOString().slice(0, 10), ...entry });
    fs.writeFileSync(HISTORY, JSON.stringify(list.slice(-500), null, 2));
    console.log(`  ~ history: recorded ${entry.kind} ${entry.id}`);
  } catch (e) { console.log(`  ! history append skipped (${e.message})`); }
}

async function main() {
  if (!fs.existsSync(POST)) skip("li/post.json not found (run li_content first)");
  const post = JSON.parse(fs.readFileSync(POST, "utf-8"));
  const tags = (post.hashtags || []).map((h) => "#" + String(h).replace(/[^a-z0-9]/gi, "")).filter((x) => x.length > 1).slice(0, 5);
  const commentary = [post.caption, tags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2900);

  if (DRY) {
    console.log(`--- LinkedIn caption ---\n${commentary}\n\n--- first comment ---\n${post.firstComment}\n`);
    return;
  }
  if (!TOKEN) skip("LI_ACCESS_TOKEN not set");
  if (!fs.existsSync(PDF)) skip("out/li_carousel.pdf not found (run li_render first)");

  const author = await personUrn().catch((e) => skip(e.message));
  console.log(`Posting document to ${author}...`);
  const docUrn = await uploadDocument(author, PDF);
  const postUrn = await createPost(author, commentary, docUrn, post.caption?.split("\n")[0]);
  console.log(`  ✓ Posted: ${postUrn || "(published)"}`);
  if (post.firstComment && postUrn) await comment(author, postUrn, post.firstComment);
  appendHistory({ kind: post.kind, id: post.id, title: (post.caption || "").split("\n")[0].slice(0, 80) });
}
main().catch((e) => { console.log(`linkedin post failed (non-fatal): ${e.message}`); process.exit(0); });
