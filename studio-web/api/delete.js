import { list, del } from "@vercel/blob";
import { REPO, WORKFLOW, gh, isAuthed, json } from "./_lib.js";

// POST {runId} -> deletes one web video everywhere:
//   1. the MP4 + caption on the public "reels" release (via the studio-delete.yml workflow — this page's
//      GitHub token is read-only for repository files)
//   2. the run itself (it disappears from "My videos"); a run still going is cancelled first
//   3. the project's files in storage (uploads, draft, manifests) — only when no other video in the list
//      belongs to the same project (a draft and its final share one project)
const DELETE_WORKFLOW = "studio-delete.yml";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!isAuthed(req)) return json(res, 401, { error: "Not logged in" });
  const id = String(req.body?.runId || "");
  if (!/^\d{5,20}$/.test(id)) return json(res, 400, { error: "bad runId" });
  try {
    const run = await gh(`/repos/${REPO}/actions/runs/${id}`);
    if (!String(run.path || "").endsWith(WORKFLOW)) return json(res, 400, { error: "not a studio video" });
    const projectId = (/\[([a-z0-9-]{6,40})\]$/.exec(run.display_title || "") || [])[1] || null;
    const notes = [];

    // 1. video files on the release (cheap, fire-and-forget workflow)
    try {
      await gh(`/repos/${REPO}/actions/workflows/${DELETE_WORKFLOW}/dispatches`, {
        method: "POST", body: JSON.stringify({ ref: "main", inputs: { run_id: id } }),
      });
    } catch (e) { notes.push(`video file: ${String(e.message || e).slice(0, 120)}`); }

    // 2. the run (cancel first if it is still going)
    if (run.status !== "completed") {
      try { await gh(`/repos/${REPO}/actions/runs/${id}/cancel`, { method: "POST" }); } catch { /* may have just finished */ }
      for (let k = 0; k < 10; k++) {
        await wait(1500);
        if ((await gh(`/repos/${REPO}/actions/runs/${id}`)).status === "completed") break;
      }
    }
    let runDeleted = true;
    try { await gh(`/repos/${REPO}/actions/runs/${id}`, { method: "DELETE" }); }
    catch (e) { runDeleted = false; notes.push(`run: ${String(e.message || e).slice(0, 120)}`); }

    // 3. storage, if nothing else uses this project
    let files = 0;
    if (projectId) {
      const others = await gh(`/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=50`);
      const shared = (others.workflow_runs || []).some((r) => String(r.id) !== id && (r.display_title || "").endsWith(`[${projectId}]`));
      if (!shared) {
        let cursor;
        do {
          const page = await list({ prefix: `projects/${projectId}/`, cursor, limit: 1000 });
          if (page.blobs.length) { await del(page.blobs.map((x) => x.url)); files += page.blobs.length; }
          cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
      } else notes.push("project files kept (another video in your list uses them)");
    }
    return json(res, 200, { ok: true, runDeleted, files, notes });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
