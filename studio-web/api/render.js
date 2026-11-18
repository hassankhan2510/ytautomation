import { put, list, issueSignedToken, presignUrl } from "@vercel/blob";
import { ACCESS, REPO, WORKFLOW, gh, isAuthed, json, safeId } from "./_lib.js";
import { readDraft } from "./draft.js";

// POST {projectId, title} -> renders the FINAL video from the edited draft: voice (only changed lines are
// re-synthesised, the rest come from the project's voice cache), music fit, render, self-check.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!isAuthed(req)) return json(res, 401, { error: "Not logged in" });
  const { projectId } = req.body || {};
  if (!safeId(projectId)) return json(res, 400, { error: "bad projectId" });
  try {
    const got = await readDraft(projectId);
    if (!got) return json(res, 404, { error: "Draft not found" });
    // the original upload manifest (for the voiceover file, if the creator uploaded one)
    const { blobs } = await list({ prefix: `projects/${projectId}/manifest` });
    let voiceover = null;
    if (blobs.length) {
      const m = await (await fetch(await got.link(blobs[0].pathname), { cache: "no-store" })).json();
      if (m.voiceover?.pathname) voiceover = { name: m.voiceover.name, url: await got.link(m.voiceover.pathname) };
    }
    const title = String(req.body?.title || got.draft.props?.job?.title || "web reel").replace(/\s+/g, " ").slice(0, 70);
    const manifest = { version: 1, stage: "final", projectId, title, script: "", settings: got.draft.settings || {}, voiceover, assets: [] };
    const saved = await put(`projects/${projectId}/final-manifest.json`, JSON.stringify(manifest),
      { access: ACCESS, contentType: "application/json", addRandomSuffix: true });
    const run = await gh(`/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { manifest_path: saved.pathname, title, stage: "final", project_id: projectId }, return_run_details: true }),
    });
    return json(res, 200, { ok: true, runId: run?.workflow_run_id ?? run?.id ?? null });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
