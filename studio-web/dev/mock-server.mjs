// Local preview of the page with FAKE server replies (no Vercel, no GitHub, no uploads).
//   node studio-web/dev/mock-server.mjs   ->  http://localhost:8790/?mock
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const page = () => fs.readFileSync(path.join(here, "..", "index.html"));
const now = Date.now();
let runs = [
  { id: 101, title: "Cohort Zero — no degree no funding [abc123xyz]", status: "completed", conclusion: "success", created: new Date(now - 3600e3).toISOString(), updated: new Date(now - 1800e3).toISOString(), url: "#", projectId: "abc123xyz", video: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", caption: "#" },
  { id: 102, title: "Lab walkthrough test [def456uvw]", status: "in_progress", conclusion: null, step: "③ Narration (your voiceover, aligned — or a voice)", created: new Date(now - 600e3).toISOString(), updated: new Date(now - 60e3).toISOString(), url: "#", projectId: "def456uvw" },
  { id: 103, title: "Broken one [ghi789rst]", status: "completed", conclusion: "failure", created: new Date(now - 86400e3 * 2).toISOString(), updated: new Date(now - 86400e3 * 2).toISOString(), url: "#", projectId: "ghi789rst" },
];
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = req.url.split("?")[0];
    if (u === "/" || u === "/index.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(page()); }
    if (u === "/api/config") return send(res, 200, { authed: true, access: "private", missing: [] });
    if (u === "/api/login") return send(res, 200, { ok: true });
    if (u === "/api/runs") return send(res, 200, { runs });
    if (u === "/api/cleanup") return send(res, 200, { ok: true, deleted: 0 });
    if (u === "/api/make") {
      const b = JSON.parse(body || "{}");
      console.log("MAKE", JSON.stringify({ ...b, assets: b.assets?.map((a) => ({ name: a.name, kind: a.kind, description: a.description })) }));
      runs = [{ id: 104, title: (b.title || "web reel") + ` [${b.projectId}]`, status: "queued", conclusion: null, created: new Date().toISOString(), updated: new Date().toISOString(), url: "#", projectId: b.projectId }, ...runs];
      return send(res, 200, { ok: true, runId: 104 });
    }
    res.writeHead(404); res.end("not found");
  });
}).listen(8790, () => console.log("mock studio on http://localhost:8790/?mock"));
