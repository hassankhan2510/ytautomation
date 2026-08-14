/**
 * Post a rendered reel to a FACEBOOK Page and an INSTAGRAM account via the Meta Graph API.
 *
 *   node scripts/meta_upload.mjs --channel=equitier --video=out/equitier_short_1_reel.mp4 \
 *        --script=jobs/equitier_short_1.json
 *   node scripts/meta_upload.mjs --channel=equitier --script=... --dry   # print captions, post nothing
 *
 * Both platforms publish video from a PUBLIC URL (Instagram requires it; Facebook accepts it), so we
 * first upload the MP4 as an asset on a GitHub Release (free public host for a public repo), then point
 * Meta at that URL. After posting we prune host assets older than a day.
 *
 * Env (per channel): META_PAGE_ID_<CH>, META_IG_USER_ID_<CH>, META_PAGE_TOKEN_<CH> (one token does both).
 * Hosting env: GITHUB_TOKEN (contents:write) + GITHUB_REPOSITORY ("owner/repo"), both auto-set in Actions.
 * Optional: META_TARGETS="fb,ig" (default both), META_VERSION (default v26.0), META_HOST_TAG (default auto-media).
 *
 * NOTE: publishes PUBLICLY. Gated: no-ops unless the token + IDs are set; does nothing on --dry. Non-fatal.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetaCaptions } from "./lib_meta_caption.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const DRY = process.argv.includes("--dry");

const CHANNEL = arg("channel", "equitier").toLowerCase();
const CH = CHANNEL.toUpperCase();
const SCRIPT = arg("script", "");
const VIDEO = arg("video", "");
const VERSION = process.env.META_VERSION || "v26.0";
const TARGETS = (process.env.META_TARGETS || "fb,ig").toLowerCase().split(/[,\s]+/).filter(Boolean);
const HOST_TAG = process.env.META_HOST_TAG || "auto-media";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(m) { console.log(`  ${m}`); }
function skip(m) { console.log(`meta post skipped: ${m}`); process.exit(0); } // never fail the pipeline

function readMeta() {
  try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, SCRIPT), "utf-8")).meta || {}; }
  catch { return {}; }
}

/* ---------- GitHub Release host ---------- */
function gh(pathname, { method = "GET", body, upload } = {}) {
  const token = process.env.GITHUB_TOKEN;
  const base = upload ? "https://uploads.github.com" : "https://api.github.com";
  return fetch(`${base}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(upload ? { "Content-Type": "application/octet-stream" } : body ? { "Content-Type": "application/json" } : {}),
    },
    body: upload ? body : body ? JSON.stringify(body) : undefined,
  });
}

async function ensureRelease(repo) {
  let r = await gh(`/repos/${repo}/releases/tags/${HOST_TAG}`);
  if (r.ok) return await r.json();
  // create a public prerelease to host media (assets on a draft release are NOT publicly downloadable)
  r = await gh(`/repos/${repo}/releases`, {
    method: "POST",
    body: { tag_name: HOST_TAG, name: "Auto media host", body: "Temporary public host for social video posting.", draft: false, prerelease: true },
  });
  if (!r.ok) throw new Error(`create release: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

async function pruneOldAssets(repo, release, maxAgeMs = 24 * 3600 * 1000) {
  for (const a of release.assets || []) {
    if (Date.now() - Date.parse(a.created_at) > maxAgeMs) {
      await gh(`/repos/${repo}/releases/assets/${a.id}`, { method: "DELETE" }).catch(() => {});
    }
  }
}

async function hostVideo(filePath, name) {
  const repo = process.env.GITHUB_REPOSITORY || arg("repo", "");
  if (!process.env.GITHUB_TOKEN || !repo) throw new Error("GITHUB_TOKEN / GITHUB_REPOSITORY not set (needed to host the video)");
  const release = await ensureRelease(repo);
  await pruneOldAssets(repo, release);
  const assetName = `${name}_${Date.now()}.mp4`;
  const bytes = fs.readFileSync(filePath);
  const up = await gh(`/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`, {
    method: "POST", upload: true, body: bytes,
  });
  if (!up.ok) throw new Error(`asset upload: ${up.status} ${(await up.text()).slice(0, 200)}`);
  const asset = await up.json();
  log(`hosted video: ${asset.browser_download_url}`);
  return { url: asset.browser_download_url, repo, assetId: asset.id };
}

/* ---------- Facebook Page video ---------- */
async function postFacebook(pageId, token, videoUrl, description) {
  const res = await fetch(`${GRAPH}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ file_url: videoUrl, description, access_token: token }).toString(),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`FB: ${JSON.stringify(j.error || j).slice(0, 250)}`);
  log(`✓ Facebook posted (video id ${j.id})`);
}

/* ---------- Instagram Reel: container -> poll -> publish ---------- */
async function postInstagram(igUserId, token, videoUrl, caption) {
  // 1) create container
  let res = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ media_type: "REELS", video_url: videoUrl, caption, access_token: token }).toString(),
  });
  let j = await res.json();
  if (!res.ok || !j.id) throw new Error(`IG container: ${JSON.stringify(j.error || j).slice(0, 250)}`);
  const creationId = j.id;

  // 2) poll until the upload/transcode finishes (reels can take a minute+)
  for (let i = 0; i < 30; i++) {
    await sleep(10000);
    const s = await fetch(`${GRAPH}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const sj = await s.json();
    const code = sj.status_code;
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") throw new Error(`IG processing ${code}: ${JSON.stringify(sj.status || sj).slice(0, 200)}`);
    log(`IG processing… (${code || "IN_PROGRESS"})`);
    if (i === 29) throw new Error("IG processing timed out");
  }

  // 3) publish
  res = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: creationId, access_token: token }).toString(),
  });
  j = await res.json();
  if (!res.ok || !j.id) throw new Error(`IG publish: ${JSON.stringify(j.error || j).slice(0, 250)}`);
  log(`✓ Instagram Reel published (media id ${j.id})`);
}

async function main() {
  const meta = readMeta();
  const caps = buildMetaCaptions(meta);

  if (DRY) {
    console.log(`--- Instagram caption (${CHANNEL}) ---\n${caps.ig}\n\n--- Facebook caption ---\n${caps.fb}\n`);
    return;
  }

  const token = process.env[`META_PAGE_TOKEN_${CH}`];
  const pageId = process.env[`META_PAGE_ID_${CH}`];
  const igUserId = process.env[`META_IG_USER_ID_${CH}`];
  if (!token) skip(`META_PAGE_TOKEN_${CH} not set`);

  const videoPath = path.resolve(ROOT, VIDEO);
  if (!VIDEO || !fs.existsSync(videoPath)) skip(`video not found: ${VIDEO}`);

  const wantFb = TARGETS.includes("fb") && pageId;
  const wantIg = TARGETS.includes("ig") && igUserId;
  if (!wantFb && !wantIg) skip(`no targets (need META_PAGE_ID_${CH} and/or META_IG_USER_ID_${CH})`);

  // Host once, reuse for both platforms.
  const name = path.basename(VIDEO).replace(/\.[^.]+$/, "");
  const host = await hostVideo(videoPath, name);

  if (wantFb) {
    try { await postFacebook(pageId, token, host.url, caps.fb); }
    catch (e) { log(`! Facebook failed: ${e.message}`); }
  }
  if (wantIg) {
    try { await postInstagram(igUserId, token, host.url, caps.ig); }
    catch (e) { log(`! Instagram failed: ${e.message}`); }
  }
}

main().catch((e) => {
  // Non-fatal by design: a social-post failure must never fail the render batch.
  console.log(`meta post failed (non-fatal): ${e.message}`);
  process.exit(0);
});
