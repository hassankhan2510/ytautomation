import { put, issueSignedToken, presignUrl } from "@vercel/blob";
import { ACCESS, CHOICES, REPO, WORKFLOW, gh, isAuthed, json, safeId } from "./_lib.js";

// POST {projectId, title, script, settings, voiceover?, assets[]} -> writes a manifest next to the
// uploads and starts the GitHub workflow "Studio — Make from Web". Private uploads get 6-hour
// read-only links so the runner can download them without any extra secret.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!isAuthed(req)) return json(res, 401, { error: "Not logged in" });
  try {
    const b = req.body || {};
    if (!safeId(b.projectId)) return json(res, 400, { error: "bad projectId" });
    const prefix = `projects/${b.projectId}/`;
    const s = b.settings || {};
    for (const [k, allowed] of Object.entries(CHOICES)) {
      if (s[k] !== undefined && !allowed.includes(s[k])) return json(res, 400, { error: `bad ${k}` });
    }
    const assets = Array.isArray(b.assets) ? b.assets.slice(0, 40) : [];
    for (const a of [...assets, ...(b.voiceover ? [b.voiceover] : [])]) {
      if (!String(a.pathname || "").startsWith(prefix)) return json(res, 400, { error: "asset outside this project" });
    }
    if (!String(b.script || "").trim() && !(b.voiceover && s.scriptMode === "from-voiceover")) {
      return json(res, 400, { error: "Write a script, or upload a voiceover and choose 'from my voiceover'" });
    }

    const validUntil = Date.now() + 6 * 60 * 60 * 1000;
    let link = async (a) => a.url;
    if (ACCESS === "private") {
      const tok = await issueSignedToken({ pathname: "*", operations: ["get"], validUntil });
      link = async (a) => (await presignUrl(tok, { operation: "get", pathname: a.pathname, access: "private", validUntil })).presignedUrl;
    }
    const stage = b.stage === "draft" ? "draft" : "direct";
    const manifest = {
      version: 1,
      stage,
      projectId: b.projectId,
      title: String(b.title || "").slice(0, 80),
      script: String(b.script || "").slice(0, 8000),
      settings: s,
      voiceover: b.voiceover ? { name: String(b.voiceover.name).slice(0, 80), pathname: b.voiceover.pathname, url: await link(b.voiceover) } : null,
      assets: await Promise.all(assets.map(async (a) => ({
        name: String(a.name).slice(0, 80), kind: a.kind === "clip" ? "clip" : "image",
        description: String(a.description || "").slice(0, 200), pathname: a.pathname, url: await link(a),
      }))),
    };
    const saved = await put(`${prefix}manifest.json`, JSON.stringify(manifest), { access: ACCESS, contentType: "application/json", addRandomSuffix: true });
    const manifestUrl = ACCESS === "private" ? await link(saved) : saved.url;

    const title = (manifest.title || manifest.script.slice(0, 60) || "web reel").replace(/\s+/g, " ");
    const run = await gh(`/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { manifest_url: manifestUrl, title, stage, project_id: b.projectId }, return_run_details: true }),
    });
    return json(res, 200, { ok: true, runId: run?.workflow_run_id ?? run?.id ?? null, runUrl: run?.html_url ?? null });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
