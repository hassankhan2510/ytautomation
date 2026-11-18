/**
 * Moves a DRAFT between the GitHub runner and private Vercel Blob storage (needs BLOB_READ_WRITE_TOKEN).
 *
 *   node blob_sync.mjs push <projectId> <props.json> <publicDir>   (after the draft run)
 *     uploads every media file the job references (public/...) to projects/<id>/draft/media/<path>
 *     and the editable draft to projects/<id>/draft/draft.json = { props, media: {relPath: pathname}, settings }
 *   node blob_sync.mjs pull <projectId> <props.json> <publicDir>   (before the final run)
 *     downloads the (edited) draft.json -> props.json, and every media file back into publicDir
 */
import fs from "node:fs";
import path from "node:path";
import { put, list, issueSignedToken, presignUrl } from "@vercel/blob";

const [cmd, pid, propsPath, pub] = process.argv.slice(2);
if (!/^[a-z0-9-]{6,40}$/.test(pid || "")) throw new Error("bad project id");
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

async function getUrl(pathname) {
  if (ACCESS === "public") {
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    return blobs[0]?.url;
  }
  const tok = await issueSignedToken({ pathname: "*", operations: ["get"], validUntil: Date.now() + 3600e3 });
  return (await presignUrl(tok, { operation: "get", pathname, access: "private" })).presignedUrl;
}

if (cmd === "push") {
  const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  const media = {};
  for (const rel of mediaPaths(props.job)) {
    const pathname = base + "media/" + rel;
    await put(pathname, fs.readFileSync(path.join(pub, rel)), { access: ACCESS, addRandomSuffix: false, allowOverwrite: true });
    media[rel] = pathname;
    console.log("  up", rel);
  }
  const settings = JSON.parse(process.env.DRAFT_SETTINGS || "{}");
  await put(base + "draft.json", JSON.stringify({ version: 1, props, media, settings, savedAt: new Date().toISOString() }),
    { access: ACCESS, contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
  const msg = `📝 **Draft ready for the editor:** ${props.job.beats.length} scenes, ${Object.keys(media).length} media files`;
  console.log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + "\n");
} else if (cmd === "pull") {
  const url = await getUrl(base + "draft.json");
  if (!url) throw new Error("no draft.json for this project");
  const d = await (await fetch(url)).json();
  fs.mkdirSync(path.dirname(path.resolve(propsPath)), { recursive: true });
  fs.writeFileSync(propsPath, JSON.stringify(d.props, null, 2));
  let n = 0;
  for (const [rel, pathname] of Object.entries(d.media || {})) {
    const dst = path.join(pub, rel);
    if (fs.existsSync(dst)) continue;
    const r = await fetch(await getUrl(pathname));
    if (!r.ok) { console.log("  ! missing", rel); continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
    n++;
  }
  console.log(`pulled the edited draft: ${d.props.job.beats.length} scenes, ${n} media files`);
} else {
  throw new Error("usage: push|pull <projectId> <props.json> <publicDir>");
}
