/**
 * Post a rendered video (or the PDF carousel) to a LinkedIn COMPANY PAGE via the versioned
 * Posts + Videos/Documents APIs (dependency-free). Caption is SEO-built from the job metadata.
 *
 *   node scripts/li_upload.mjs --channel=equitier --video=out/equitier_short_1_reel.mp4 \
 *        --script=jobs/equitier_short_1.json
 *   node scripts/li_upload.mjs --channel=equitier --document=out/equitier_carousel.pdf --script=... --type=document
 *   node scripts/li_upload.mjs --channel=equitier --script=... --dry   # print the caption, post nothing
 *
 * Auth (env): either LI_ACCESS_TOKEN, or LI_CLIENT_ID + LI_CLIENT_SECRET + LI_REFRESH_TOKEN.
 * Page URN (env): LI_ORG_URN_<CHANNEL>  e.g. "urn:li:organization:1234567" (or just "1234567").
 * Optional: LI_VERSION (default 202408), LI_LINK_IN_COMMENT=1 (put the video link in the first comment).
 *
 * NOTE: this publishes PUBLICLY to the Page. It is gated: it no-ops unless the token + org URN are set,
 * and it does nothing on --dry. Run once manually with --dry, then without, to verify before automating.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLinkedInCaption } from "./lib_linkedin_caption.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const DRY = process.argv.includes("--dry");

const CHANNEL = arg("channel", "equitier").toLowerCase();
const SCRIPT = arg("script", "");
const VIDEO = arg("video", "");
const DOCUMENT = arg("document", "");
const TYPE = arg("type", VIDEO ? "video" : DOCUMENT ? "document" : "video");
const VERSION = process.env.LI_VERSION || "202408";
const LINK_IN_COMMENT = process.env.LI_LINK_IN_COMMENT === "1";

const API = "https://api.linkedin.com/rest";

function skip(msg) {
  console.log(`linkedin post skipped: ${msg}`);
  process.exit(0); // non-fatal: a missing token should never fail the render pipeline
}
function orgUrn() {
  const raw = process.env[`LI_ORG_URN_${CHANNEL.toUpperCase()}`] || process.env.LI_ORG_URN || "";
  if (!raw) return "";
  return /^urn:li:organization:/.test(raw) ? raw : `urn:li:organization:${String(raw).replace(/\D/g, "")}`;
}
function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(ROOT, SCRIPT), "utf-8")).meta || {};
  } catch {
    return {};
  }
}

async function accessToken() {
  if (process.env.LI_ACCESS_TOKEN) return process.env.LI_ACCESS_TOKEN;
  const { LI_CLIENT_ID, LI_CLIENT_SECRET, LI_REFRESH_TOKEN } = process.env;
  if (!LI_CLIENT_ID || !LI_CLIENT_SECRET || !LI_REFRESH_TOKEN) return "";
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: LI_REFRESH_TOKEN,
      client_id: LI_CLIENT_ID,
      client_secret: LI_CLIENT_SECRET,
    }).toString(),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...extra,
  };
}

// --- video: initialize -> PUT each part (capture ETag) -> finalize -> return video URN ---
async function uploadVideo(token, owner, file) {
  const bytes = fs.readFileSync(file);
  const init = await fetch(`${API}/videos?action=initializeUpload`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      initializeUploadRequest: { owner, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false },
    }),
  });
  const ij = await init.json();
  const v = ij.value;
  if (!init.ok || !v?.video) throw new Error(`video init: ${JSON.stringify(ij).slice(0, 300)}`);
  const parts = [];
  for (const inst of v.uploadInstructions || []) {
    const slice = bytes.subarray(inst.firstByte, inst.lastByte + 1);
    const pr = await fetch(inst.uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: slice,
    });
    if (!pr.ok) throw new Error(`video part ${parts.length}: ${pr.status}`);
    const etag = pr.headers.get("etag") || pr.headers.get("ETag");
    if (etag) parts.push(etag.replace(/"/g, ""));
    console.log(`  · uploaded part ${parts.length} (${(slice.length / 1048576).toFixed(1)} MB)`);
  }
  const fin = await fetch(`${API}/videos?action=finalizeUpload`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || "", uploadedPartIds: parts } }),
  });
  if (!fin.ok) throw new Error(`video finalize: ${fin.status} ${(await fin.text()).slice(0, 200)}`);
  return v.video;
}

// --- document (PDF carousel): initialize -> single PUT -> return document URN ---
async function uploadDocument(token, owner, file) {
  const bytes = fs.readFileSync(file);
  const init = await fetch(`${API}/documents?action=initializeUpload`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const ij = await init.json();
  const v = ij.value;
  if (!init.ok || !v?.document || !v?.uploadUrl) throw new Error(`document init: ${JSON.stringify(ij).slice(0, 300)}`);
  const pr = await fetch(v.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!pr.ok) throw new Error(`document upload: ${pr.status}`);
  return v.document;
}

async function createPost(token, author, commentary, mediaUrn, title) {
  const res = await fetch(`${API}/posts`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      author,
      commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: mediaUrn, title: String(title || "").slice(0, 200) } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (res.status !== 201) throw new Error(`create post: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "(posted)";
}

async function comment(token, author, postUrn, text) {
  try {
    await fetch(`${API}/socialActions/${encodeURIComponent(postUrn)}/comments`, {
      method: "POST",
      headers: headers(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ actor: author, message: { text } }),
    });
  } catch {
    /* first-comment is a nicety; never fail the post over it */
  }
}

async function main() {
  const meta = readMeta();
  const { caption, firstComment } = buildLinkedInCaption(meta, { linkInComment: LINK_IN_COMMENT });

  if (DRY) {
    console.log(`--- LinkedIn caption preview (${CHANNEL}, type=${TYPE}) ---\n${caption}\n`);
    if (firstComment) console.log(`--- first comment ---\n${firstComment}\n`);
    return;
  }

  const org = orgUrn();
  if (!org) skip(`LI_ORG_URN_${CHANNEL.toUpperCase()} not set`);
  let token;
  try {
    token = await accessToken();
  } catch (e) {
    skip(e.message);
  }
  if (!token) skip("no LI_ACCESS_TOKEN and no refresh credentials");

  const file = path.resolve(ROOT, TYPE === "document" ? DOCUMENT : VIDEO);
  if (!fs.existsSync(file)) skip(`file not found: ${TYPE === "document" ? DOCUMENT : VIDEO}`);

  console.log(`Posting ${TYPE} to LinkedIn Page (${org})...`);
  const mediaUrn = TYPE === "document" ? await uploadDocument(token, org, file) : await uploadVideo(token, org, file);
  const postUrn = await createPost(token, org, caption, mediaUrn, meta.title);
  console.log(`  ✓ Posted to LinkedIn: ${postUrn}`);
  if (firstComment) await comment(token, org, postUrn, firstComment);
}

main().catch((e) => {
  // Non-fatal by design: a LinkedIn failure must never fail the whole render batch.
  console.log(`linkedin post failed (non-fatal): ${e.message}`);
  process.exit(0);
});
