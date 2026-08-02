/**
 * Upload a rendered video to YouTube via the Data API v3 (dependency-free).
 *
 *   node scripts/yt_upload.mjs --channel=equitier --video=out/equitier_short_1_reel.mp4 \
 *        --script=jobs/equitier_short_1.json --privacy=private
 *
 * Reads OAuth from env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN_<CHANNEL>.
 * Metadata (title/description/tags/links) comes from the job's script JSON. Shorts get "#Shorts".
 * Uploads as PRIVATE by default so a human approves before it goes public.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildChapters, buildDescription } from "./lib_description.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};

const CHANNEL = (arg("channel", "equitier")).toLowerCase();
const VIDEO = arg("video", "");
const SCRIPT = arg("script", "");
const THUMB = arg("thumb", ""); // optional custom thumbnail (long-form)
const PRIVACY = arg("privacy", "private"); // private | unlisted | public
const CATEGORY = arg("category", "22"); // 22 = People & Blogs (safe default)

const CLIENT_ID = process.env.YT_CLIENT_ID;
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
const REFRESH = process.env[`YT_REFRESH_TOKEN_${CHANNEL.toUpperCase()}`];

function fail(msg) {
  console.error(`upload skipped: ${msg}`);
  process.exit(1);
}

function readMeta() {
  const p = SCRIPT ? path.resolve(ROOT, SCRIPT) : path.join(ROOT, "src", "data", "script.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")).meta || {};
  } catch {
    return {};
  }
}

function readTimeline() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "timeline.json"), "utf-8"));
  } catch {
    return null;
  }
}

function buildSnippet(meta) {
  const isShort = ["shorts", "reel"].includes(meta.platform);
  let title = String(meta.title || "Video");
  if (isShort && !/#shorts/i.test(title)) title = `${title.slice(0, 88)} #Shorts`;
  title = title.slice(0, 100);

  const description = buildDescription(meta, buildChapters(readTimeline()));
  const tags = Array.isArray(meta.tags) ? meta.tags.slice(0, 15) : [];
  return { title, description, tags, categoryId: CATEGORY };
}

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH,
      grant_type: "refresh_token",
    }).toString(),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) fail("YT_CLIENT_ID / YT_CLIENT_SECRET not set");
  if (!REFRESH) fail(`YT_REFRESH_TOKEN_${CHANNEL.toUpperCase()} not set`);
  const videoPath = path.resolve(ROOT, VIDEO);
  if (!VIDEO || !fs.existsSync(videoPath)) fail(`video not found: ${VIDEO}`);

  const meta = readMeta();
  const snippet = buildSnippet(meta);
  const status = { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false };

  const token = await accessToken();
  const video = fs.readFileSync(videoPath);
  const boundary = "b" + crypto.randomBytes(16).toString("hex");
  const pre = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ snippet, status }) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: video/*\r\n\r\n`,
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([pre, video, post]);

  console.log(`Uploading "${snippet.title}" (${(video.length / 1048576).toFixed(1)} MB) as ${PRIVACY}...`);
  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const j = await res.json();
  if (!res.ok || !j.id) throw new Error(`upload: ${JSON.stringify(j).slice(0, 300)}`);
  console.log(`  ✓ Uploaded: https://youtu.be/${j.id}  (Studio: https://studio.youtube.com/video/${j.id}/edit)`);

  // Set the custom thumbnail (long-form). Best-effort: needs custom-thumbnail eligibility on the
  // channel; if it's not allowed the video still keeps its auto frame.
  const thumbPath = THUMB ? path.resolve(ROOT, THUMB) : "";
  if (thumbPath && fs.existsSync(thumbPath)) {
    try {
      const png = fs.readFileSync(thumbPath);
      const tr = await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${j.id}&uploadType=media`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" }, body: png },
      );
      if (tr.ok) console.log("  ✓ Custom thumbnail set");
      else console.log(`  ! thumbnail not set (${tr.status}) — video keeps its auto frame`);
    } catch (e) {
      console.log(`  ! thumbnail not set (${e.message}) — video keeps its auto frame`);
    }
  }
}

main().catch((e) => {
  console.error(`upload failed: ${e.message}`);
  process.exit(1);
});
