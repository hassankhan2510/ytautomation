import { REPO, WORKFLOW, gh, isAuthed, json } from "./_lib.js";

// GET -> your recent videos: status, the step it's on, and (when done) the phone-friendly MP4 link.
// The workflow names its MP4 "web-<run id>.mp4" on the rolling "reels" release.
export default async function handler(req, res) {
  if (!isAuthed(req)) return json(res, 401, { error: "Not logged in" });
  try {
    const data = await gh(`/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=15`);
    const base = `https://github.com/${REPO}/releases/download/reels`;
    const runs = await Promise.all((data.workflow_runs || []).map(async (r) => {
      let step = null;
      if (r.status !== "completed") {
        try {
          const jobs = await gh(`/repos/${REPO}/actions/runs/${r.id}/jobs`);
          const st = jobs.jobs?.[0]?.steps || [];
          step = (st.find((x) => x.status === "in_progress") || st.filter((x) => x.status === "completed").pop() || {}).name || null;
        } catch { /* status only */ }
      }
      const done = r.status === "completed" && r.conclusion === "success";
      return {
        id: r.id, title: r.display_title, status: r.status, conclusion: r.conclusion, step,
        created: r.created_at, updated: r.updated_at, url: r.html_url,
        projectId: (/\[([a-z0-9-]{6,40})\]$/.exec(r.display_title || "") || [])[1] || null,
        video: done ? `${base}/web-${r.id}.mp4` : null,
        caption: done ? `${base}/web-${r.id}-caption.txt` : null,
      };
    }));
    return json(res, 200, { runs });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
