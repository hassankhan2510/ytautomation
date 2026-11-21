import { list, del, issueSignedToken, presignUrl } from "@vercel/blob";
import { ACCESS, isAuthed, json, safeId } from "./_lib.js";

// POST {projectId} -> deletes that project's uploads from Blob (called by the page once the video is
// done, so the free Blob allowance never fills up). The finished MP4 lives on GitHub, not here.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!isAuthed(req)) return json(res, 401, { error: "Not logged in" });
  const id = req.body?.projectId;
  const keepDraft = Boolean(req.body?.keepDraft);   // keep projects/<id>/draft/ so "Edit again" still works
  if (!safeId(id)) return json(res, 400, { error: "bad projectId" });
  try {
    let cursor, n = 0;
    const voice = new Set();   // the uploaded voiceover (any file type) — "Edit again" re-renders with it
    if (keepDraft) {
      const ms = (await list({ prefix: `projects/${id}/manifest` })).blobs;
      const link = ACCESS === "public" ? async (b) => b.url : async (b) => (await presignUrl(await issueSignedToken({ pathname: b.pathname, operations: ["get"], validUntil: Date.now() + 600e3 }), { operation: "get", pathname: b.pathname, access: "private", useCache: false })).presignedUrl;
      for (const b of ms) {
        try { const m = await (await fetch(await link(b), { cache: "no-store" })).json(); if (m.voiceover?.pathname) voice.add(m.voiceover.pathname); } catch { /* unreadable manifest: keep audio by extension below */ }
      }
    }
    do {
      const page = await list({ prefix: `projects/${id}/`, cursor, limit: 1000 });
      // keepDraft: keep the editable draft (+ its media copies), the manifests and the voiceover (audio);
      // only the original photo/clip uploads go (the draft has its own copies)
      const keep = (x) => keepDraft && (x.pathname.includes("/draft/") || /\.json$/i.test(x.pathname) || voice.has(x.pathname) || /\.(mp3|m4a|wav|ogg|opus|aac|flac)$/i.test(x.pathname));
      const gone = page.blobs.filter((x) => !keep(x));
      if (gone.length) { await del(gone.map((x) => x.url)); n += gone.length; }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return json(res, 200, { ok: true, deleted: n });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
