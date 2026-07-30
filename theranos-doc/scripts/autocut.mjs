/**
 * AUTO-CUT: turn one long-form video into several vertical Reels/Shorts.
 *
 * Reads  src/data/script.json (a long-form script)
 * Writes jobs/reel_1.json ... reel_N.json  (each a self-contained 9:16 reel)
 *
 * It splits the long-form into N contiguous chunks (each a coherent mini-story),
 * repackages each as a `reel` script (vertical, punchy target length), and keeps
 * every line's assets / layout / captions. Then run `npm run batch` to render them.
 *
 * These are a strong mechanical baseline — for maximum punch, an AI can rewrite the
 * opening line of each reel into a sharper hook afterwards.
 *
 * Run:  node scripts/autocut.mjs [count]      (default count = 4)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "data", "script.json");
const JOBS = path.join(ROOT, "jobs");

const count = Math.max(1, parseInt(process.argv[2] || "4", 10));

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("No src/data/script.json to cut. Create the long-form video first.");
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(SRC, "utf-8"));
  const m = src.meta || {};
  const lines = src.lines || [];
  if (lines.length < count) {
    console.error(`Only ${lines.length} lines — can't make ${count} reels.`);
    process.exit(1);
  }

  fs.mkdirSync(JOBS, { recursive: true });
  const chunkSize = Math.ceil(lines.length / count);
  let made = 0;

  for (let n = 0; n < count; n++) {
    const chunk = lines.slice(n * chunkSize, (n + 1) * chunkSize);
    if (chunk.length === 0) continue;

    const reel = {
      meta: {
        title: `${m.title || "Video"} — Reel ${n + 1}`,
        topic: m.topic || m.title || "",
        niche: m.niche,
        channel: m.channel,
        platform: "reel",
        targetSeconds: Math.round(chunk.length * 4.5),
        fps: m.fps || 30,
        style: m.style,
        voice: m.voice,
        pauseBetweenLinesSec: m.pauseBetweenLinesSec ?? 0.35,
        music: m.music ?? null,
        musicVolume: m.musicVolume ?? 0.14,
        accentColor: m.accentColor,
        description: m.description || m.title || "",
        tags: m.tags && m.tags.length >= 3 ? m.tags : ["reel", "short", "clip"],
        researchFile: "research.md",
        requireResearch: false, // research was done for the parent long-form
      },
      lines: chunk,
    };

    const out = path.join(JOBS, `reel_${n + 1}.json`);
    fs.writeFileSync(out, JSON.stringify(reel, null, 2));
    console.log(`  + jobs/reel_${n + 1}.json  (${chunk.length} lines, ~${reel.meta.targetSeconds}s)`);
    made++;
  }

  console.log(`\nCut into ${made} reel(s). Render them with:  npm run batch\n`);
}

main();
