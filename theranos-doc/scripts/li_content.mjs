/**
 * LINKEDIN CONTENT ENGINE (Phase 3).
 *
 * Reads li/subject.json (a fresh repo or paper), then multi-pass Groq:
 *   1) ANALYZE  — extract the real substance: the shift, why it matters, how it works, the applied
 *                 CTO + CEO moves, a stat, and YOUR point of view.
 *   2) COMPOSE  — turn that into a premium carousel: an insight-extracted HOOK (no templates),
 *                 a POV thesis, and the RIGHT diagram type per point (from the 18 in LiSlides).
 * Writes src/data/li_carousel.json (slides to render) + li/post.json (the caption + first comment).
 *
 * Deterministic fallback if Groq is down, so a run never produces junk.
 *   node scripts/li_content.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LI_DIR = path.join(ROOT, "li");
const SUBJECT = path.join(LI_DIR, "subject.json");
const CAROUSEL = path.join(ROOT, "src", "data", "li_carousel.json");
const POST = path.join(LI_DIR, "post.json");

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const BRAND = process.env.LI_BRAND || "HASSAN KHAN";
const HANDLE = process.env.LI_HANDLE || "Building Syndar & Equitier";
const ACCENT = process.env.LI_ACCENT || "#4f8cff";

async function callGroq(system, user, maxTokens = 2600) {
  if (!GROQ_API_KEY) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL, temperature: 0.6, max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      const d = await res.json();
      const txt = d.choices?.[0]?.message?.content || "";
      try { return JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    } catch { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
  }
  return null;
}

/* ---------- slide validation ---------- */
const REQ = {
  cover: (s) => !!s.title,
  thesis: (s) => !!s.text,
  flow: (s) => Array.isArray(s.steps) && s.steps.length >= 2,
  architecture: (s) => s.core && Array.isArray(s.parts) && s.parts.length >= 2,
  stack: (s) => Array.isArray(s.layers) && s.layers.length >= 2,
  timeline: (s) => Array.isArray(s.events) && s.events.length >= 2,
  compare: (s) => s.left && s.right && Array.isArray(s.left.items) && Array.isArray(s.right.items),
  matrix: (s) => Array.isArray(s.quadrants) && s.quadrants.length >= 4,
  table: (s) => Array.isArray(s.headers) && s.headers.length === 2 && Array.isArray(s.rows) && s.rows.length >= 2,
  checklist: (s) => Array.isArray(s.items) && s.items.length >= 2,
  stat: (s) => (s.value || s.value === 0) && s.label,
  statGrid: (s) => Array.isArray(s.stats) && s.stats.length >= 2,
  metricBars: (s) => Array.isArray(s.bars) && s.bars.length >= 2,
  code: (s) => Array.isArray(s.lines) && s.lines.length >= 2,
  pillars: (s) => Array.isArray(s.columns) && s.columns.length >= 2,
  bullets: (s) => Array.isArray(s.items) && s.items.length >= 2,
  quote: (s) => s.text && s.author,
  cta: (s) => !!s.title,
};
function coerce(s) {
  if (!s || !REQ[s.type]) return null;
  if (s.type === "metricBars") s.bars = (s.bars || []).map((b) => ({ label: String(b.label || ""), value: Math.max(0, Math.min(100, Number(b.value) || 0)) }));
  if (s.type === "checklist") s.items = (s.items || []).map((it) => ({ text: String(it.text || ""), ok: !!it.ok }));
  if (s.type === "matrix") s.quadrants = (s.quadrants || []).slice(0, 4);
  if (s.type === "table") s.rows = (s.rows || []).filter((r) => Array.isArray(r) && r.length === 2);
  return REQ[s.type](s) ? s : null;
}
// Salvage a broken slide into bullets if it carries any text list.
function salvage(s) {
  const list = (Array.isArray(s.items) && s.items) || (Array.isArray(s.steps) && s.steps) || (Array.isArray(s.points) && s.points);
  if (list && list.length >= 2) return { type: "bullets", title: s.title || null, items: list.map(String).slice(0, 5) };
  return null;
}

/* ---------- prompts ---------- */
const SLIDE_MENU = `Available slide types (pick the BEST fit per point — vary them, don't repeat):
- cover {kicker, title, sub}            the HOOK slide (title = the hook)
- thesis {label, text}                  YOUR one-sentence opinion / bet / reframe
- flow {title, steps:[3-5]}             a process or sequence
- architecture {title, core, parts:[2-4]}  a system: a core + its components
- stack {title, layers:[{name,desc}]}   layered components
- timeline {title, events:[{when,what}]} evolution over time
- compare {title, left:{title,items:[]}, right:{title,items:[]}}  before/after or A vs B
- matrix {title, xLabel, yLabel, quadrants:[4x {label,note}]}  a 2x2 framework
- table {title, headers:[2], rows:[[a,b]]}  a comparison table
- checklist {title, items:[{text, ok:true|false}]}  do this / not that
- stat {value, label, sub}              one big number
- statGrid {title, stats:[{value,label}]}  several numbers
- metricBars {title, bars:[{label, value:0-100}]}  relative comparison
- code {title, lang, lines:[]}          a short code snippet (repos)
- pillars {title, columns:[{title,desc}]}  2-4 columns
- bullets {title, items:[]}             key points
- quote {text, author, role}            an external quote
- cta {title, sub}                      closing follow prompt`;

const HOOK_RULES = `HOOK (the cover title): the single most surprising/counterintuitive truth about THIS specific subject,
stated as a sharp, concrete claim. Extract the real insight — do NOT describe that it is popular.
BANNED openers (auto-reject): "blew up", "just dropped", "just released", "everyone's talking about",
"game-changer", "the future of", "🚨", "let that sink in", "here's why". No emojis. No hashtags in the hook.`;

async function analyze(subj) {
  const src = subj.kind === "repo"
    ? `REPO: ${subj.id} (${subj.stars} stars, ${subj.language})\nDESCRIPTION: ${subj.description}\nREADME (excerpt):\n${(subj.readme || "").slice(0, 3500)}`
    : `PAPER: ${subj.title}\nAUTHORS: ${(subj.authors || []).join(", ")}\nABSTRACT:\n${subj.abstract || ""}`;
  const sys = `You are a top-0.01% tech analyst. Read the source and extract the real substance. Return ONLY JSON:
{"shift": string (what actually changed, one sentence),
 "why": string (the non-obvious implication),
 "how": [3-5 short steps of how it works],
 "cto": string (how a builder/CTO applies this in a real system),
 "ceo": string (the business/strategy bet a CEO should make),
 "pov": string (a sharp, opinionated one-liner — YOUR take, a bet or reframe, not a summary),
 "stat": {"value": string, "label": string} | null,
 "hooks": [3 candidate hooks per the rules]}
${HOOK_RULES}`;
  return (await callGroq(sys, src, 1600)) || {};
}

async function compose(subj, brief) {
  const sys = `You compose a premium LinkedIn CAROUSEL for a tech founder building authority. One subject only.
Return ONLY JSON: {"caption": string, "firstComment": string, "hashtags": [4-6], "slides": [ ...6-8 slides... ]}.
${SLIDE_MENU}
RULES:
- slides[0] MUST be "cover" (the hook). slides[last] MUST be "cta".
- Include at least one "how it works" diagram (flow OR architecture OR code) and at least one "apply"
  slide (checklist OR pillars OR compare OR matrix), plus one "thesis" (the POV). VARY the diagram types.
- Every slide is skimmable: short, concrete, specific to THIS subject. No fluff, no hashtags inside slides.
- "caption" = the LinkedIn post text: a scroll-stopping first line (same insight as the hook), 2-4 short lines
  (the shift + why it matters + a dual CTO/CEO note), end with a soft question. NO link in the caption.
- "firstComment" = a short line pointing to the source ("Source: <url>").
${HOOK_RULES}`;
  const usr = `SUBJECT (${subj.kind}): ${subj.kind === "repo" ? subj.id : subj.title}\nURL: ${subj.url}\nBRIEF:\n${JSON.stringify(brief).slice(0, 3000)}\nCompose the carousel now.`;
  return await callGroq(sys, usr, 3000);
}

/* ---------- fallback (deterministic, no Groq) ---------- */
function fallback(subj, brief) {
  const name = subj.kind === "repo" ? subj.title : subj.title.split(":")[0];
  const how = Array.isArray(brief.how) && brief.how.length >= 2 ? brief.how : [subj.description || "A new approach to the problem.", "It changes the default workflow.", "Adoption is spreading fast."];
  const slides = [
    { type: "cover", kicker: subj.kind === "repo" ? "The Frontier" : "New Research", title: (brief.hooks && brief.hooks[0]) || (subj.description || name), sub: subj.kind === "repo" ? `${subj.stars} stars, and here's why it matters.` : "Here's what it actually changes." },
    { type: "flow", title: "How it works", steps: how.slice(0, 4).map(String) },
    { type: "thesis", label: "My Take", text: brief.pov || "The interface layer wins — not the model." },
    { type: "checklist", title: "How I'd apply it", items: [{ text: brief.cto || "Standardize this in your stack early.", ok: true }, { text: brief.ceo || "Don't bet the moat on the wrong layer.", ok: false }] },
    { type: "cta", title: "I break down one frontier shift every few days.", sub: "Source in the comments — follow for the next one." },
  ];
  return {
    caption: `${(brief.hooks && brief.hooks[0]) || name}\n\n${brief.why || subj.description || ""}\n\nWhat would you build on top of it?`,
    firstComment: `Source: ${subj.url}`,
    hashtags: ["AI", "buildinpublic", "tech", "startups"],
    slides,
  };
}

function sanitize(model, subj) {
  let slides = Array.isArray(model.slides) ? model.slides.map((s) => coerce(s) || salvage(s)).filter(Boolean) : [];
  // ensure a cover first
  if (!slides.length || slides[0].type !== "cover") {
    slides.unshift({ type: "cover", kicker: subj.kind === "repo" ? "The Frontier" : "New Research", title: subj.description || subj.title, sub: "" });
  }
  // ensure a cta last
  if (slides[slides.length - 1].type !== "cta") slides.push({ type: "cta", title: "Follow for the next breakdown.", sub: "Source in the comments." });
  // de-dup consecutive identical types (keeps variety), cap length
  const out = [];
  for (const s of slides) { if (out.length && out[out.length - 1].type === s.type && s.type !== "cta") continue; out.push(s); }
  return out.slice(0, 9);
}

async function main() {
  if (!fs.existsSync(SUBJECT)) { console.error("li/subject.json not found — run li_source.mjs first."); process.exit(1); }
  const subj = JSON.parse(fs.readFileSync(SUBJECT, "utf-8"));
  console.log(`Composing for ${subj.kind}: ${subj.kind === "repo" ? subj.id : subj.title}`);

  const brief = await analyze(subj);
  let model = await compose(subj, brief);
  if (!model || !Array.isArray(model.slides) || model.slides.length < 3) {
    console.log("  (Groq compose unavailable/short — using deterministic fallback)");
    model = fallback(subj, brief);
  }
  const slides = sanitize(model, subj);

  fs.writeFileSync(CAROUSEL, JSON.stringify({ brand: BRAND, handle: HANDLE, accent: ACCENT, slides }, null, 2));
  fs.mkdirSync(LI_DIR, { recursive: true });
  fs.writeFileSync(POST, JSON.stringify({
    kind: subj.kind, id: subj.id, url: subj.url,
    caption: model.caption || slides[0].title || "",
    firstComment: model.firstComment || `Source: ${subj.url}`,
    hashtags: model.hashtags || [],
  }, null, 2));

  console.log(`\n  ${slides.length} slides: ${slides.map((s) => s.type).join(" -> ")}`);
  console.log(`  hook: ${slides[0].title}`);
  console.log(`  -> src/data/li_carousel.json + li/post.json`);
}
main().catch((e) => { console.error("li_content failed:", e.message); process.exit(1); });
