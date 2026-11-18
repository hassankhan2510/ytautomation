import { ACCESS, isAuthed, json } from "./_lib.js";

// GET -> what the page needs to know: logged in? which Blob access mode? is the server configured?
export default async function handler(req, res) {
  const missing = ["STUDIO_PASSWORD", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN"].filter((k) => !process.env[k]);
  let authed = false;
  try { authed = isAuthed(req); } catch { authed = false; }
  return json(res, 200, { authed, access: ACCESS, missing });
}
