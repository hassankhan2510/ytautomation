/**
 * Moves a DRAFT between the GitHub runner and private Vercel Blob storage — THROUGH THE STUDIO PAGE:
 * the runner proves itself with RUNNER_KEY (a key you create; GitHub secret + Vercel variable) and never
 * holds the storage key. Uploads use the page's /api/upload route; downloads get short-lived links from
 * /api/runner. No link is ever printed (the repo's Actions logs are public).
 * Env: STUDIO_URL (e.g. https://your-app.vercel.app), RUNNER_KEY, BLOB_ACCESS (private|public, default private)
 *
 *   node blob_sync.mjs push <projectId> <props.json> <publicDir>   (after the draft run)
 *   node blob_sync.mjs pull <projectId> <props.json> <publicDir>   (before the final run)
 */
import fs from "node:fs";
import path from "node:path";
import { upload } from "@vercel/blob/client";

const [cmd, pid, propsPath, pub] = process.argv.slice(2);
if (!/^[a-z0-9-]{6,40}$/.test(pid || "")) throw new Error("bad project id");
const STUDIO = String(process.env.STUDIO_URL || "").replace(/\/+$/, "");
const KEY = process.env.RUNNER_KEY || "";
if (!/^https:\/\//.test(STUDIO) || KEY.length < 20) throw new Error("STUDIO_URL / RUNNER_KEY GitHub secrets are missing (see studio-web/README.md)");
const ACCESS = process.env.BLOB_ACCESS === "public" ? "public" : "private";
const base = `projects/${pid}/draft/`;
const MEDIA = /\.(jpe?g|png|webp|gif|mp4|mov|m4v|webm|wav|mp3|m4a|ogg|opus)$/i;

function mediaPaths(job) {
  const out = new Set();
  const walk = (o) => {
    if (typeof o === "string") {
      const p = o.replace(/^\/+/, "");
      if (MEDIA.test(p) && !/^(https?:|data:|blob:)/.test(p) && fs.existsSync(path.join(pub, p))) out.add(p);
    } else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(job);
  return [...out];
}
const safeRel = (rel) => rel.replace(/[^A-Za-z0-9._\/-]+/g, "-");

async function links(paths) {
  const r = await fetch(`${STUDIO}/api/runner`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: KEY, paths }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`studio /api/runner ${r.status}: ${j.error || ""}`);
  return j.urls || {};
}
async function send(pathname, body, contentType) {
  return upload(pathname, body, { access: ACCESS, handleUploadUrl: `${STUDIO}/api/upload`, clientPayload: KEY, contentType,
    multipart: body.length > 20e6 });
}

if (cmd === "push") {
  const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  const media = {};
  for (const rel of mediaPaths(props.job)) {
    const pathname = base + "media/" + safeRel(rel);
    await send(pathname, fs.readFileSync(path.join(pub, rel)));
    media[rel] = pathname;
    console.log("  up", rel);
  }
  const settings = JSON.parse(process.env.DRAFT_SETTINGS || "{}");
  const draft = JSON.stringify({ version: 1, props, media, settings, savedAt: new Date().toISOString() });
  await send(base + "draft.json", Buffer.from(draft), "application/json");
  const msg = `📝 **Draft ready for the editor:** ${props.job.beats.length} scenes, ${Object.keys(media).length} media files`;
  console.log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + "\n");
} else if (cmd === "pull") {
  const u = (await links([base + "draft.json"]))[base + "draft.json"];
  const r = u && (await fetch(u, { cache: "no-store" }));
  if (!r || !r.ok) throw new Error("no draft.json for this project");
  const d = await r.json();
  fs.mkdirSync(path.dirname(path.resolve(propsPath)), { recursive: true });
  fs.writeFileSync(propsPath, JSON.stringify(d.props, null, 2));
  const want = Object.entries(d.media || {}).filter(([rel]) => !fs.existsSync(path.join(pub, rel)));
  const urls = want.length ? await links(want.map(([, p]) => p)) : {};
  let n = 0;
  for (const [rel, pathname] of want) {
    const res = urls[pathname] && (await fetch(urls[pathname]));
    if (!res || !res.ok) { console.log("  ! missing", rel); continue; }
    fs.mkdirSync(path.dirname(path.join(pub, rel)), { recursive: true });
    fs.writeFileSync(path.join(pub, rel), Buffer.from(await res.arrayBuffer()));
    n++;
  }
  console.log(`pulled the edited draft: ${d.props.job.beats.length} scenes, ${n} media files`);
} else {
  throw new Error("usage: push|pull <projectId> <props.json> <publicDir>");
}
