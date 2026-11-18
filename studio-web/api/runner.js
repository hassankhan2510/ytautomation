import { issueSignedToken, presignUrl, list } from "@vercel/blob";
import { ACCESS, isRunner, json } from "./_lib.js";

// POST {key, paths: [pathname, …]} -> { urls: {pathname: short-lived read link} }
// Only the GitHub runner (RUNNER_KEY) may call this, only for files under projects/. The links are fetched at
// run time and never printed, so nothing private shows up in the public Actions logs.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!isRunner(req.body?.key)) return json(res, 401, { error: "bad runner key" });
  const paths = (Array.isArray(req.body?.paths) ? req.body.paths : []).slice(0, 200);
  if (!paths.every((p) => /^projects\/[a-z0-9-]{6,40}\/[A-Za-z0-9._\/-]+$/.test(String(p)) && !String(p).includes(".."))) return json(res, 400, { error: "bad path" });
  try {
    const urls = {};
    if (ACCESS === "public") {
      for (const p of paths) urls[p] = (await list({ prefix: p, limit: 1 })).blobs[0]?.url || null;
    } else {
      const tok = await issueSignedToken({ pathname: "*", operations: ["get"], validUntil: Date.now() + 3 * 3600e3 });
      for (const p of paths) urls[p] = (await presignUrl(tok, { operation: "get", pathname: p, access: "private", useCache: false })).presignedUrl;
    }
    return json(res, 200, { urls });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
