/**
 * SCENE WRITER — one Groq call (reuses the main pipeline's qwen client) that BOTH writes a short
 * whiteboard-explainer script AND picks 1-3 icon primitives per scene from the tagged catalog.
 * Writes src/data/scenes.json with placeholder timing; voice.py then fills real timing + audio.
 *
 *   TOPIC="why most startups fail" BRAND="COHORT ZERO" NICHE=business GROQ_API_KEY=... node scripts/gen_scenes.mjs
 *   node scripts/gen_scenes.mjs --dry     # no API — keeps the existing sample scenes.json
 *
 * Groq keys come from the same env as the main pipeline (GROQ_API_KEY[_2/_3], GROQ_MODEL, GROQ_TPM).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groqJSON } from "../../theranos-doc/scripts/lib_groq.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCENES = path.join(ROOT, "src", "data", "scenes.json");
const DRY = process.argv.includes("--dry");

const TOPIC = process.env.TOPIC || "why most startups actually fail";
const BRAND = process.env.BRAND || "COHORT ZERO";
const NICHE = process.env.NICHE || "startup / founder";
const ACCENT = process.env.ACCENT || "#e11d48";

// id -> tags (kept in sync with src/primitives.ts). The AI may only choose ids from here.
const CATALOG = {
  idea: "idea insight innovation think learn aha", rocket: "launch startup growth scale fast momentum",
  chart_up: "growth revenue increase results profit traction up", bars: "data metrics comparison stats numbers",
  arrow_right: "next flow then leads step cause result", target: "goal focus aim objective product market fit niche",
  coin: "money cash revenue price invest wealth capital", person: "founder customer person user you ceo",
  people: "team network community users audience cohort partners", building: "company business market office enterprise vc firm",
  warning: "warning risk mistake danger avoid fail trap", check: "success correct do right win done works",
  cross: "wrong dont stop avoid no fail myth", clock: "time patience timing wait speed long term compound",
  gear: "system how process engine mechanism build works", magnifier: "research find search analysis discover insight",
  steps: "steps how to guide plan roadmap framework stages", speech: "advice quote talk opinion message story ask",
  shield: "moat defense protect security trust advantage", flag: "milestone goal win launch achievement",
  handshake: "deal partnership agreement funding close acquire", brain: "ai brain learn smart intelligence psychology mindset",
  funnel: "funnel sales conversion filter leads pipeline", scale: "balance tradeoff compare decision versus weigh",
  key: "key unlock secret access solution answer", trophy: "win success best achievement top champion",
  calendar: "calendar schedule daily plan routine consistency habit", cloud: "cloud saas tech software platform infra",
  chart_down: "loss crash decline down drop burn churn risk", plus: "add more grow new benefit gain",
};
const IDS = new Set(Object.keys(CATALOG));

async function main() {
  if (DRY) { console.log("dry: leaving existing scenes.json untouched"); return; }

  const catalogText = Object.entries(CATALOG).map(([id, tags]) => `${id}: ${tags}`).join("\n");
  const sys =
    `You script a punchy WHITEBOARD EXPLAINER for "${BRAND}" (${NICHE}). Return ONLY JSON: ` +
    `{"scenes":[{"text": string, "primitives": string[]}]}. 6-8 scenes. Each "text" is ONE on-screen ` +
    `line <= 9 words, plain and concrete, building a single clear argument with a strong first line and ` +
    `a payoff at the end. For each scene choose 1-3 "primitives" — icon ids FROM THIS CATALOG ONLY that ` +
    `visualize the line (e.g. an idea + a cross for "not about the idea"). CATALOG (id: keywords):\n${catalogText}\n` +
    `Rules: use ONLY ids from the catalog; 1-3 per scene; prefer icons whose keywords match the line; no markdown.`;
  const usr = `TOPIC: ${TOPIC}\nWrite the explainer now.`;

  const m = await groqJSON(sys, usr, { maxTokens: 1500, temperature: 0.6 });
  if (!m || !Array.isArray(m.scenes) || !m.scenes.length) { console.error("Groq returned no scenes — re-run."); process.exit(1); }

  const fps = 30, per = 120; // placeholder 4s/scene; voice.py overrides with real speech length
  let start = 0;
  const scenes = m.scenes.slice(0, 8).map((s) => {
    const prims = (Array.isArray(s.primitives) ? s.primitives : []).map(String).filter((id) => IDS.has(id)).slice(0, 3);
    const scene = { text: String(s.text || "").replace(/[*`#]/g, "").trim().slice(0, 90), primitives: prims.length ? prims : ["idea"], startFrame: start, durationInFrames: per };
    start += per;
    return scene;
  }).filter((s) => s.text);

  const doc = { meta: { accent: ACCENT, ink: "#141a22", brand: BRAND, fps }, totalDurationInFrames: start, scenes };
  fs.writeFileSync(SCENES, JSON.stringify(doc, null, 2));
  console.log(`  + ${path.relative(ROOT, SCENES)} — ${scenes.length} scenes`);
  scenes.forEach((s, i) => console.log(`    ${i + 1}. [${s.primitives.join(", ")}]  ${s.text}`));
  console.log(`\nNext:  python scripts/voice.py   (adds Kokoro voice + real timing)\n       npm run render`);
}
main().catch((e) => { console.error("gen_scenes failed:", e.message); process.exit(1); });
