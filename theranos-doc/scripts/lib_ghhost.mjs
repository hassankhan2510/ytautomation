/**
 * Host a local file as a PUBLIC GitHub Release asset and return its URL. Buffer/Meta pull media from a
 * URL (they don't accept raw uploads), and a public repo's Release assets are a free public host.
 * Needs GITHUB_TOKEN (contents:write) + GITHUB_REPOSITORY ("owner/repo") — both auto-set in Actions.
 * Old assets are pruned after ~24h so the release doesn't grow forever.
 *
 * NOTE: only works if the repo is PUBLIC (private-repo release assets aren't publicly downloadable).
 */
import fs from "node:fs";

const HOST_TAG = process.env.MEDIA_HOST_TAG || "auto-media";
const API = "https://api.github.com";
const UPLOADS = "https://uploads.github.com";

function gh(pathname, { method = "GET", body, upload } = {}) {
  const token = process.env.GITHUB_TOKEN;
  const base = upload ? UPLOADS : API;
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
  if (r.ok) return r.json();
  // A prerelease (not draft) so its assets are publicly downloadable.
  r = await gh(`/repos/${repo}/releases`, {
    method: "POST",
    body: { tag_name: HOST_TAG, name: "Auto media host", body: "Temporary public host for social posting.", draft: false, prerelease: true },
  });
  if (!r.ok) throw new Error(`create release: ${r.status} ${(await r.text()).slice(0, 150)}`);
  return r.json();
}

async function prune(repo, release, maxAgeMs = 24 * 3600 * 1000) {
  for (const a of release.assets || []) {
    if (Date.now() - Date.parse(a.created_at) > maxAgeMs) {
      await gh(`/repos/${repo}/releases/assets/${a.id}`, { method: "DELETE" }).catch(() => {});
    }
  }
}

let seq = 0, pruned = false;
export async function hostFile(filePath, name = "asset", ext = "png") {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repo) throw new Error("GITHUB_TOKEN / GITHUB_REPOSITORY not set (needed to host media)");
  const release = await ensureRelease(repo);
  if (!pruned) { await prune(repo, release); pruned = true; }
  const assetName = `${name}_${Date.now()}_${seq++}.${ext}`;
  const up = await gh(`/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`, {
    method: "POST", upload: true, body: fs.readFileSync(filePath),
  });
  if (!up.ok) throw new Error(`asset upload: ${up.status} ${(await up.text()).slice(0, 150)}`);
  const asset = await up.json();
  return { url: asset.browser_download_url, assetId: asset.id };
}
