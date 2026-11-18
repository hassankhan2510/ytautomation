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
  { id: 106, title: "Event promo · draft [evt123abc]", stage: "draft", draftReady: true, cleanTitle: "Event promo", status: "completed", conclusion: "success", created: new Date(now - 300e3).toISOString(), updated: new Date(now - 200e3).toISOString(), url: "#", projectId: "evt123abc" },
  { id: 103, title: "Broken one [ghi789rst]", status: "completed", conclusion: "failure", created: new Date(now - 86400e3 * 2).toISOString(), updated: new Date(now - 86400e3 * 2).toISOString(), url: "#", projectId: "ghi789rst" },
];
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = req.url.split("?")[0];
    if (u === "/" || u === "/index.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(page()); }
    // live-preview test: the bundled engine, a real props file, and the studio's public/ media
    const TYPES = { ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4" };
    const serve = (file) => {
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("missing " + file); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(file).pipe(res);
    };
    const pub = path.join(here, "..", "..", "studio", "public");
    if (u === "/preview.js") return serve(path.join(here, "..", "preview.js"));
    if (u === "/preview-test.html") return serve(path.join(here, "preview-test.html"));
    if (u === "/sweep.html") return serve(path.join(here, "sweep.html"));
    if (u === "/dev-props.json") return serve(process.env.PREVIEW_PROPS || path.join(here, "sample-props.json"));
    if (u.startsWith("/studio-public/")) return serve(path.join(pub, decodeURIComponent(u.slice("/studio-public/".length))));
    if (u.startsWith("/sfx/") || u.startsWith("/brand/")) return serve(path.join(pub, decodeURIComponent(u.slice(1))));
    if (u === "/api/config") return send(res, 200, { authed: true, access: "private", missing: [] });
    if (u === "/api/login") return send(res, 200, { ok: true });
    if (u === "/api/runs") return send(res, 200, { runs });
    if (u === "/api/cleanup") return send(res, 200, { ok: true, deleted: 0 });
    if (u === "/api/draft" && req.method === "GET") {
      const props = JSON.parse(fs.readFileSync(path.join(here, "sample-props.json"), "utf8"));
      const media = {}, walk = (o) => { if (typeof o === "string") { if (/\.(jpe?g|png|webp|mp4|wav|mp3)$/i.test(o)) media[o] = "/studio-public/" + o; } else if (o && typeof o === "object") Object.values(o).forEach(walk); };
      walk(props.job);
      for (const f of fs.readdirSync(path.join(pub, "gen")).filter((f) => f.startsWith("proj-"))) media["gen/" + f] = "/studio-public/gen/" + f;
      return send(res, 200, { props, settings: { language: "english" }, media });
    }
    if (u === "/api/draft") { console.log("SAVE", body.length, "bytes"); return send(res, 200, { ok: true }); }
    if (u === "/api/render") { console.log("RENDER", body); return send(res, 200, { ok: true, runId: 105 }); }
    if (u === "/api/make") {
      const b = JSON.parse(body || "{}");
      console.log("MAKE", JSON.stringify({ ...b, assets: b.assets?.map((a) => ({ name: a.name, kind: a.kind, description: a.description })) }));
      runs = [{ id: 104, title: (b.title || "web reel") + ` [${b.projectId}]`, status: "queued", conclusion: null, created: new Date().toISOString(), updated: new Date().toISOString(), url: "#", projectId: b.projectId }, ...runs];
      return send(res, 200, { ok: true, runId: 104 });
    }
    res.writeHead(404); res.end("not found");
  });
}).listen(8790, () => console.log("mock studio on http://localhost:8790/?mock"));
