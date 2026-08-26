/**
 * SCENE WRITER — one Groq call that (a) writes a punchy whiteboard-explainer script and (b) picks the
 * matching primitive icon(s) for each line from the tagged catalog. Reuses the main pipeline's proven
 * Groq client (qwen, throttled, robust JSON). Writes src/data/scenes.json.
 *
 *   TOPIC="Why most startups die" GROQ_API_KEY=xxx node scripts/gen_scenes.mjs
 *   node scripts/gen_scenes.mjs --dry     # no API — keeps the existing sample scenes.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groqJSON } from "../../theranos-doc/scripts/lib_groq.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCENES = path.join(ROOT, "src", "data", "scenes.json");
const DRY = process.argv.includes("--dry");

const TOPIC = process.env.TOPIC || "Why most startups die";
const BRAND = process.env.WB_BRAND || "COHORT ZERO";
const ACCENT = process.env.WB_ACCENT || "#e11d48";
const AUDIENCE = process.env.WB_AUDIENCE || "founders and early-stage startups";
const FPS = 30;
const SCENE_FRAMES = 95; // default per-scene length; voice.py overrides with real audio timing

// id -> tags (kept in sync with src/primitives.ts). The AI may only choose from these ids.
const CATALOG = {
  idea: "idea insight innovation think learn aha", rocket: "launch startup growth scale fast momentum",
  chart_up: "growth revenue increase results profit traction", bars: "data metrics comparison stats numbers",
  arrow_right: "next flow then leads step cause result", target: "goal focus aim product-market-fit niche",
  coin: "money cash revenue price invest wealth capital", person: "founder customer user you ceo",
  people: "team network community users audience cohort", building: "company business market corporate office",
  warning: "warning risk mistake danger avoid fail trap", check: "success correct do right win done works",
  cross: "wrong dont stop avoid no fail myth", clock: "time patience timing speed long-term compound",
  gear: "system how process engine mechanism build", magnifier: "research find search analysis discover",
  steps: "steps how-to guide plan roadmap framework", speech: "advice quote talk opinion message ask",
  shield: "moat defense protect security trust advantage", flag: "milestone goal win launch achievement",
  handshake: "deal partnership funding close acquire term-sheet", brain: "ai brain learn smart psychology mindset",
  funnel: "funnel sales conversion leads pipeline acquisition", scale: "balance tradeoff compare decision versus",
  key: "key unlock secret access solution answer", trophy: "win success best achievement top champion",
  calendar: "schedule daily plan routine consistency habit", cloud: "cloud saas tech software platform",
  chart_down: "loss crash decline down burn churn risk", plus: "add more grow new benefit gain",
};
const VALID = new Set(Object.keys(CATALOG));

async function main() {
  if (DRY) { console.log("dry: leaving existing sample scenes.json in place"); return; }

  const catalogText = Object.entries(CATALOG).map(([id, tags]) => `${id} — ${tags}`).join("\n");
  const sys =
    `You script a premium WHITEBOARD EXPLAINER video for "${BRAND}" (audience: ${AUDIENCE}). Return ONLY JSON: ` +
    `{"title": string, "scenes": [ {"text": string, "primitives": [1-2 ids]} ] } with 6-8 scenes. ` +
    `RULES: each "text" is ONE spoken idea, <= 16 words, concrete and specific (no fluff, no markdown, no emojis); ` +
    `the scenes build hook -> insight -> payoff and can be read aloud naturally. For each scene choose 1-2 ` +
    `primitive IDs whose meaning matches the idea, using ONLY ids from this catalog:\n${catalogText}`;
  const model = await groqJSON(sys, `TOPIC: ${TOPIC}`, { maxTokens: 1600, temperature: 0.6 });
  if (!model || !Array.isArray(model.scenes) || !model.scenes.length) {
    console.error("  ! Groq returned no usable scenes — keeping the existing scenes.json.");
    process.exit(1);
  }

  let from = 0;
  const scenes = model.scenes.slice(0, 8).map((s) => {
    const prims = (Array.isArray(s.primitives) ? s.primitives : []).filter((p) => VALID.has(p)).slice(0, 2);
    const scene = { text: String(s.text || "").replace(/[*`#]/g, "").trim(), primitives: prims.length ? prims : ["idea"], from, durationInFrames: SCENE_FRAMES };
    from += SCENE_FRAMES;
    return scene;
  }).filter((s) => s.text);

  const data = { fps: FPS, width: 1920, height: 1080, accent: ACCENT, brand: BRAND, title: String(model.title || TOPIC), scenes, totalDurationInFrames: from + 15 };
  fs.writeFileSync(SCENES, JSON.stringify(data, null, 2));
  console.log(`  + scenes.json  "${data.title}"  (${scenes.length} scenes)`);
  scenes.forEach((s, i) => console.log(`    ${i + 1}. [${s.primitives.join(", ")}]  ${s.text.slice(0, 60)}`));
}

main().catch((e) => { console.error("gen_scenes failed:", e.message); process.exit(1); });
