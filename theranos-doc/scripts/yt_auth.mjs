/**
 * One-time helper: get a YouTube refresh token for auto-upload (dependency-free).
 *
 * Prereqs: a "Desktop app" OAuth client from Google Cloud (see docs/YOUTUBE_UPLOAD.md), downloaded
 * as theranos-doc/client_secret.json. Then run:  node scripts/yt_auth.mjs
 *
 * It opens Google's consent page in your browser, catches the redirect on a local port, exchanges
 * the code, and prints your REFRESH TOKEN. Copy it into the GitHub secret YT_REFRESH_TOKEN_<CHANNEL>.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

function loadClient() {
  // Prefer env vars; else read a client_secret*.json in the project root.
  let id = process.env.YT_CLIENT_ID;
  let secret = process.env.YT_CLIENT_SECRET;
  if (!id || !secret) {
    const file =
      fs.existsSync(path.join(ROOT, "client_secret.json"))
        ? path.join(ROOT, "client_secret.json")
        : fs.readdirSync(ROOT).map((f) => path.join(ROOT, f)).find((f) => /client_secret.*\.json$/.test(f));
    if (!file) {
      console.error("No client_secret.json found in theranos-doc/. Download it from Google Cloud → Credentials.");
      process.exit(1);
    }
    const j = JSON.parse(fs.readFileSync(file, "utf-8"));
    const c = j.installed || j.web || j;
    id = c.client_id;
    secret = c.client_secret;
  }
  if (!id || !secret) {
    console.error("Could not read client_id / client_secret.");
    process.exit(1);
  }
  return { id, secret };
}

function openBrowser(url) {
  try {
    const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    execSync(cmd, { stdio: "ignore", shell: true });
  } catch {
    /* fall back to printing the URL */
  }
}

async function main() {
  const { id, secret } = loadClient();

  const server = http.createServer();
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}`;

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
    }).toString();

  console.log("\nOpening your browser to authorize... if it doesn't open, paste this URL:\n");
  console.log(authUrl + "\n");
  openBrowser(authUrl);

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for authorization")), 300000);
    server.on("request", (req, resp) => {
      const u = new URL(req.url, redirectUri);
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      resp.writeHead(200, { "Content-Type": "text/html" });
      resp.end("<h2>Done — you can close this tab and return to the terminal.</h2>");
      clearTimeout(timer);
      if (err) reject(new Error(err));
      else if (c) resolve(c);
    });
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const tok = await tokenRes.json();
  server.close();

  if (!tok.refresh_token) {
    console.error("\nNo refresh_token returned. Make sure the OAuth app is PUBLISHED (in production) and you approved with prompt=consent. Response:\n", tok);
    process.exit(1);
  }

  console.log("\n=========================================================");
  console.log("  YT_REFRESH_TOKEN  (add as a GitHub secret):\n");
  console.log("  " + tok.refresh_token);
  console.log("\n  Also add YT_CLIENT_ID and YT_CLIENT_SECRET from client_secret.json.");
  console.log("=========================================================\n");
}

main().catch((e) => { console.error("auth failed:", e.message); process.exit(1); });
