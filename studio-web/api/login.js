import { checkPassword, makeCookie, json } from "./_lib.js";

// POST {password} -> sets the session cookie (30 days)
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  // small fixed delay: makes password guessing slow
  await new Promise((r) => setTimeout(r, 600));
  if (!checkPassword(req.body?.password)) return json(res, 401, { error: "Wrong password" });
  res.setHeader("Set-Cookie", makeCookie());
  return json(res, 200, { ok: true });
}
