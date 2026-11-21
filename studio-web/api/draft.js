import { put, issueSignedToken, presignUrl, list } from "@vercel/blob";
import { ACCESS, isAuthed, json, safeId } from "./_lib.js";

// GET  ?projectId=…  -> { props, settings, media: {relPath: link} }   (the editor loads the draft)
// POST {projectId, props} -> saves the edited storyboard back (the final render pulls it)
async function linker() {
  if (ACCESS === "public") return async (pathname) => (await list({ prefix: pathname, limit: 1 })).blobs[0]?.url;
  const tok = await issueSignedToken({ pathname: "*", operations: ["get"], validUntil: Date.now() + 6 * 3600e3 });
  return async (pathname) => (await presignUrl(tok, { operation: "get", pathname, access: "private", useCache: false })).presignedUrl;  // never an old cached draft
}

export async function readDraft(projectId) {
  const link = await linker();
  const url = await link(`projects/${projectId}/draft/draft.json`);
  const r = url && (await fetch(url, { cache: "no-store" }));
  if (!r || !r.ok) return null;
  return { draft: await r.json(), link };
}

export default async function handler(req, res) {
  if (!isAuthed(req)) return json(res, 401, { error: "Not logged in" });
  const projectId = req.method === "GET" ? req.query?.projectId : req.body?.projectId;
  if (!safeId(projectId)) return json(res, 400, { error: "bad projectId" });
  try {
    const got = await readDraft(projectId);
    if (!got) return json(res, 404, { error: "Draft not ready yet" });
    const { draft, link } = got;
    if (req.method === "GET") {
      const media = {};
      await Promise.all(Object.entries(draft.media || {}).map(async ([rel, pathname]) => { media[rel] = await link(pathname); }));
      return json(res, 200, { props: draft.props, settings: draft.settings || {}, media, savedAt: draft.savedAt });
    }
    if (req.method === "POST") {
      const props = req.body?.props;
      if (!props?.job || !Array.isArray(props.job.beats) || props.job.beats.length > 60) return json(res, 400, { error: "bad storyboard" });
      if (JSON.stringify(props).length > 600_000) return json(res, 400, { error: "storyboard too large" });
      await put(`projects/${projectId}/draft/draft.json`, JSON.stringify({ ...draft, props, savedAt: new Date().toISOString() }),
        { access: ACCESS, contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "GET or POST" });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
