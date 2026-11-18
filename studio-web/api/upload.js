import { handleUpload } from "@vercel/blob/client";
import { isAuthed, json, safeId } from "./_lib.js";

// Client uploads: the browser sends files STRAIGHT to Vercel Blob (no 4.5 MB function limit).
// This route only hands out a short-lived token — and only to a logged-in session, only for
// projects/<id>/..., only media types, at most 500 MB per file.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  try {
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAuthed(req)) throw new Error("Not logged in");
        const m = /^projects\/([a-z0-9-]+)\/[^/]+$/.exec(pathname);
        if (!m || !safeId(m[1])) throw new Error("Bad upload path");
        return {
          allowedContentTypes: ["image/*", "video/*", "audio/*", "application/ogg"],
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: true,
          validUntil: Date.now() + 60 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {},
    });
    return json(res, 200, result);
  } catch (e) {
    return json(res, 400, { error: String(e.message || e) });
  }
}
