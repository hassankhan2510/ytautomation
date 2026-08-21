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
import { groqJSON } from "./lib_groq.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LI_DIR = path.join(ROOT, "li");
const SUBJECT = path.join(LI_DIR, "subject.json");
const CAROUSEL = path.join(ROOT, "src", "data", "li_carousel.json");
const POST = path.join(LI_DIR, "post.json");

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
// Quality gate: if Groq can't produce real content, ABORT (no render, no upload) rather than ship
// the deterministic fallback. On by default; set LI_REQUIRE_GROQ=0 to allow the fallback.
const REQUIRE_GROQ = process.env.LI_REQUIRE_GROQ !== "0";
const BRAND = process.env.LI_BRAND || "HASSAN KHAN";
const HANDLE = process.env.LI_HANDLE || "Building Syndar & Equitier";
const ACCENT = process.env.LI_ACCENT || ""; // optional: pin the accent; otherwise a theme rotates per post
// Author byline shown on EVERY slide (the "creator carousel" signal). Drop a headshot at
// theranos-doc/public/<file> and set LI_AVATAR=<file>; else a clean accent monogram is used.
const LI_NAME = process.env.LI_NAME || "Hassan Khan";
const LI_AT = process.env.LI_AT || "@hassankhan";
const LI_AVATAR = process.env.LI_AVATAR || "";

// CREATOR look: a clean near-black base with just a whisper of the accent hue, so the author byline +
// big type carry the slide (not a busy background). The accent still rotates per post for highlights —
// dots, numbers, kickers — so the feed stays varied without looking like a template.
const THEMES = [
  { name: "electric-blue", accent: "#4f8cff", bg: ["#0b0d12", "#08090d", "#050609"], angle: 160 },
  { name: "emerald",       accent: "#2ece8a", bg: ["#0a0f0d", "#07090a", "#050708"], angle: 155 },
  { name: "violet",        accent: "#9b7bff", bg: ["#0d0b12", "#09080d", "#060509"], angle: 170 },
  { name: "amber",         accent: "#f5a623", bg: ["#0f0d09", "#0a0908", "#060505"], angle: 150 },
  { name: "cyan",          accent: "#22d3ee", bg: ["#0a0e10", "#07090b", "#050708"], angle: 165 },
  { name: "rose",          accent: "#fb7185", bg: ["#0f0b0d", "#0a080a", "#060506"], angle: 175 },
  { name: "lime",          accent: "#a3e635", bg: ["#0c0e0a", "#080a07", "#060706"], angle: 158 },
  { name: "indigo",        accent: "#6366f1", bg: ["#0b0c12", "#08080d", "#050609"], angle: 168 },
];
// Extra axes of variety, each rotated on a different hash offset so combinations rarely repeat:
const MOTIFS = ["plain", "grid", "rays", "rings"];   // faint background texture
const COVERS = ["standard", "centered", "rule", "mark"]; // cover-slide layout
const SHAPES = ["square", "circle", "diamond"];      // brand + bullet marker shape
function pickStyle(subj) {
  const now = new Date();
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const id = String(subj.id || subj.title || "");
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const theme = THEMES[(h + day) % THEMES.length];
  const style = {
    ...(ACCENT ? { ...theme, accent: ACCENT, name: `${theme.name}+pin` } : theme),
    motif: MOTIFS[(h * 3 + day) % MOTIFS.length],
    cover: COVERS[(h * 7 + day) % COVERS.length],
    shape: SHAPES[(h * 5 + day) % SHAPES.length],
  };
  return style;
}

const callGroq = (system, user, maxTokens = 2400) => groqJSON(system, user, { maxTokens, temperature: 0.6 });

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
    ? `REPO: ${subj.id} (${subj.stars} stars, ${subj.language})\nDESCRIPTION: ${subj.description}\nREADME (excerpt):\n${(subj.readme || "").slice(0, 4000)}`
    : `PAPER: ${subj.title}\nAUTHORS: ${(subj.authors || []).join(", ")}\nABSTRACT:\n${subj.abstract || ""}`;
  const sys = `You are a top-0.01% tech analyst whose gift is making frontier AI make sense to smart builders.
Read the source and extract the substance that lets a reader finish SMARTER (not just informed). Return ONLY JSON:
{"coreIdea": string (the ONE idea this whole post teaches, in plain words),
 "bridge": string (ONE honest sentence bridging this to the reader's world / AI agents / building —
    e.g. "The same reason human teams stall is now the #1 bug in multi-agent AI". Must be an HONEST analogy, not a stretch),
 "runningExample": string (one concrete, everyday example you can thread through the whole deck),
 "shift": string (what actually changed, one sentence),
 "why": string (the non-obvious implication),
 "how": [3-5 short steps of the real MECHANISM — what you'd DRAW to show how it works],
 "terms": [{"term": string, "plain": string}]  (2-4 key jargon terms a non-expert wouldn't know, each in plain English),
 "surprisingFinding": {"value": string, "label": string, "meaning": string} | null
    (a REAL number/result FROM the source — NOT GitHub stars — plus what it means; null if the source has none),
 "source": string (who made it — authors, lab, or org — the authority worth naming),
 "cto": string (how a builder/CTO applies this in a real system),
 "ceo": string (the business/strategy bet a CEO should make),
 "applications": [2-4 concrete, real-world places this could be USED — specific products, industries, or
    workflows a normal person would recognize (e.g. "customer-support agents that stop looping",
    "warehouse robots that don't freeze in the dark")],
 "startupIdea": {"what": string (a concrete product/startup you could BUILD on top of this),
    "who": string (who'd pay for it), "example": string (a one-line concrete example)},
 "pov": string (a sharp, opinionated one-liner — YOUR bet or reframe, not a summary),
 "hooks": [3 candidate hooks per the rules]}
Translate every term a non-expert wouldn't know. surprisingFinding must be a genuine result from the text, or null.
GROUNDING (HARD, non-negotiable): every capability, number, and claim ABOUT THE SUBJECT must be explicitly
supported by the SOURCE text above. If the source doesn't state it, do NOT assert it — say less rather than
invent. The "applications" and "startupIdea" are YOUR forward-looking ideas: phrase them as possibilities
("you could build…", "this could power…"), and NEVER attribute them to the source as things it did or claims.
${HOOK_RULES}`;
  return (await callGroq(sys, src, 2000)) || {};
}

async function compose(subj, brief) {
  const sys = `You compose a premium, TEACHING LinkedIn CAROUSEL that makes the reader finish SMARTER and positions the
author as "the person who makes frontier AI finally make sense." ONE subject only.
Return ONLY JSON: {"caption": string, "firstComment": string, "hashtags": [4-6], "slides": [ ...7-9 slides... ]}.
${SLIDE_MENU}
FOLLOW THIS SPINE — this fixed order is the author's SIGNATURE structure; keep it:
1. cover     — the hook: a sharp, concrete, surprising claim about THIS subject.
2. thesis    — make the BRIDGE explicit: the honest analogy to the reader's world (use brief.bridge). By slide 2 the reader knows why THEY care.
3. TRANSLATE — define the key jargon in plain English. Use a "table" (headers ["Term","In plain English"], rows from brief.terms) OR a "stack" (layers name=term, desc=plain).
4. MECHANISM — how it ACTUALLY works, DRAWN as a diagram: "architecture" (core + parts) or "flow" (steps from brief.how). This is the signature geometry — draw it, never a plain bullet list.
5. FINDING   — the surprising real result as a "stat": value + label from brief.surprisingFinding, and NAME THE SOURCE in its "sub" (e.g. "— <source>"). Skip only if surprisingFinding is null (then use a "quote" or another mechanism slide).
6. APPLY     — what you could BUILD with this: real-world applications (brief.applications) + one concrete product/startup idea (brief.startupIdea) as "pillars" or "bullets". Frame as IDEAS/possibilities ("you could build…"), never as things the source claims to have done.
7. thesis    — the POV (brief.pov): your bet or reframe.
8. cta        — closing follow prompt.
THREAD brief.runningExample through at least 2 body slides so the deck reads as ONE lesson, not a list.
Every slide: concrete, specific to THIS subject, jargon already translated, no fluff, no hashtags inside slides.
"caption" = a LinkedIn post ANYONE can read — a CEO, an operator, a student, not just engineers. Start with a
plain-language, scroll-stopping first line, explain in HUMAN terms what changed and why it matters to them, then a
concrete "here's what you could build with this" angle (use brief.applications + brief.startupIdea, as ideas), and
end with a real question. Short sentences, no unexplained jargon, no buzzwords — a smart non-technical reader must
finish it feeling it applies to THEM. NO link.
"firstComment" = "Source: <url>".
${HOOK_RULES}`;
  const usr = `SUBJECT (${subj.kind}): ${subj.kind === "repo" ? subj.id : subj.title}\nURL: ${subj.url}\nBRIEF:\n${JSON.stringify(brief).slice(0, 3500)}\nCompose the carousel now, following the spine.`;
  return await callGroq(sys, usr, 3400);
}

// PASS 3 — a ruthless editor that scores the draft against the rubric and rewrites weak slides.
async function editPass(subj, brief, draft) {
  const sys = `You are a ruthless editor making this LinkedIn carousel worth paying real attention to.
Score the draft against this rubric, REWRITE any slide that fails, keep what already passes, and return the
FULL improved carousel in the SAME JSON shape: {"caption","firstComment","hashtags":[4-6],"slides":[7-9]}.
RUBRIC — every item must pass:
1. Slide 2 makes the analogy/bridge to the reader's world EXPLICIT (not a generic intro).
2. Every technical term is translated to plain English somewhere in the deck.
3. The core mechanism is DRAWN as a real diagram (architecture/flow), not a plain bullet list.
4. There is ONE surprising, real finding shown as a number, WITH the source named (unless the source truly has none).
5. A single running example carries through at least two slides.
6. The hook is a concrete, specific claim — no hype ("blew up", "the future of", "game-changer").
7. No slide is vague or padded; cut any slide that says nothing new.
8. The deck answers "so what can I build with this?" — at least one slide gives concrete applications AND a
   product/startup idea, framed as possibility (not as a claim the source makes).
9. The CAPTION is readable by a non-technical person (plain language, jargon translated, short sentences) and
   makes them feel it applies to them — not an engineer-only post.
10. NOTHING about the subject is asserted that isn't supported by the source; applications/ideas are clearly
    the author's ("you could build…"), never attributed to the source.
${SLIDE_MENU}
Return ONLY the JSON.`;
  const usr = `SUBJECT: ${subj.kind === "repo" ? subj.id : subj.title}\nURL: ${subj.url}\nBRIEF:\n${JSON.stringify(brief).slice(0, 2000)}\nDRAFT:\n${JSON.stringify(draft).slice(0, 4500)}\nReturn the improved carousel.`;
  return await callGroq(sys, usr, 2800);
}

/* ---------- fallback (deterministic, no Groq) — richer, uses the real subject data ---------- */
function fallback(subj, brief) {
  const isRepo = subj.kind === "repo";
  const name = (isRepo ? subj.title : String(subj.title).split(":")[0]).trim();
  // Pull real sentences from the README / abstract for substance, not placeholder text.
  const body = String(subj.readme || subj.abstract || subj.description || "").replace(/\s+/g, " ");
  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 30 && s.length < 170);
  const how = Array.isArray(brief.how) && brief.how.length >= 3 ? brief.how.slice(0, 4).map(String) : null;

  const terms = Array.isArray(brief.terms) ? brief.terms.filter((t) => t && t.term && t.plain).slice(0, 4) : [];
  const finding = brief.surprisingFinding && brief.surprisingFinding.value ? brief.surprisingFinding : null;

  const slides = [];
  // 1. hook
  slides.push({ type: "cover", kicker: isRepo ? "The Frontier" : "New Research", title: (brief.hooks && brief.hooks[0]) || subj.description || name, sub: isRepo ? `${Number(subj.stars || 0).toLocaleString()} stars — here's why it matters.` : "Here's what it actually changes." });
  // 2. bridge (make the reader care)
  if (brief.bridge) slides.push({ type: "thesis", label: "Why you care", text: brief.bridge });
  // 3. translate the jargon
  if (terms.length >= 2) slides.push({ type: "table", title: "In plain English", headers: ["Term", "What it means"], rows: terms.map((t) => [String(t.term), String(t.plain)]) });
  // 4. mechanism, drawn
  if (how) slides.push({ type: "flow", title: "How it actually works", steps: how });
  else if (sentences.length >= 3) slides.push({ type: "bullets", title: "What it does", items: sentences.slice(0, 3) });
  // 5. the surprising real finding (with source named), else fall back to a covers-topics slide
  if (finding) slides.push({ type: "stat", value: String(finding.value), label: String(finding.label || "the result"), sub: brief.source ? `${finding.meaning ? finding.meaning + " " : ""}— ${brief.source}` : (finding.meaning || "") });
  else if (isRepo && subj.stars) slides.push({ type: "stat", value: subj.stars >= 1000 ? `${Math.round(subj.stars / 1000)}k` : String(subj.stars), label: "GitHub stars", sub: subj.language ? `Built in ${subj.language}.` : "" });
  else if (isRepo && Array.isArray(subj.topics) && subj.topics.length >= 2) slides.push({ type: "pillars", title: "What it covers", columns: subj.topics.slice(0, 4).map((t) => ({ title: String(t), desc: "" })) });
  // 6. apply
  slides.push({ type: "checklist", title: "How I'd apply it", items: [{ text: brief.cto || "Standardize this in your stack early.", ok: true }, { text: brief.ceo || "Don't bet the moat on the wrong layer.", ok: false }] });
  // 7. POV
  if (brief.pov) slides.push({ type: "thesis", label: "My Take", text: brief.pov });
  // 8. cta
  slides.push({ type: "cta", title: "I break down one frontier shift every few days.", sub: "Source in the comments — follow for the next one." });

  return {
    caption: `${(brief.hooks && brief.hooks[0]) || name}\n\n${brief.bridge ? brief.bridge + "\n\n" : ""}${brief.why || subj.description || ""}\n\nWhat would you build on top of it?`,
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
  console.log(`Groq: key ${GROQ_API_KEY ? "SET" : "MISSING"} | model ${GROQ_MODEL}`);

  const brief = await analyze(subj);
  let model = await compose(subj, brief);
  const haveGroqContent = !!(model && Array.isArray(model.slides) && model.slides.length >= 5);
  if (haveGroqContent) {
    console.log("  editing (ruthless quality pass)...");
    const edited = await editPass(subj, brief, model);
    if (edited && Array.isArray(edited.slides) && edited.slides.length >= 5) model = edited;
    else console.log("  (edit pass skipped — keeping composed draft)");
  }
  if (!haveGroqContent) {
    if (REQUIRE_GROQ) {
      // Remove any stale output so a previous run's carousel can never be rendered/posted by mistake.
      for (const f of [CAROUSEL, POST]) { try { fs.rmSync(f, { force: true }); } catch {} }
      console.error("\n  ✗ QUALITY GATE: Groq produced no usable content — ABORTING this run.");
      console.error("    No carousel is written, so nothing will render and nothing will post to LinkedIn.");
      console.error("    (Better to skip a day than ship a weak deck.) Fix Groq — check the ✓/✗ lines above");
      console.error("    for the key/model status — then re-run. To allow the deterministic fallback instead,");
      console.error("    set the repo variable LI_REQUIRE_GROQ=0.");
      process.exit(3);
    }
    console.log("  (Groq compose unavailable/short — using deterministic fallback)");
    model = fallback(subj, brief);
  }
  const slides = sanitize(model, subj);
  const theme = pickStyle(subj);

  fs.writeFileSync(CAROUSEL, JSON.stringify({ brand: BRAND, handle: HANDLE, name: LI_NAME, at: LI_AT, avatar: LI_AVATAR, accent: theme.accent, bg: theme.bg, angle: theme.angle, theme: theme.name, motif: theme.motif, cover: theme.cover, shape: theme.shape, slides }, null, 2));
  fs.mkdirSync(LI_DIR, { recursive: true });
  fs.writeFileSync(POST, JSON.stringify({
    kind: subj.kind, id: subj.id, url: subj.url,
    caption: model.caption || slides[0].title || "",
    firstComment: model.firstComment || `Source: ${subj.url}`,
    hashtags: model.hashtags || [],
  }, null, 2));

  console.log(`\n  ${slides.length} slides: ${slides.map((s) => s.type).join(" -> ")}`);
  console.log(`  style: ${theme.name} (${theme.accent}) | cover:${theme.cover} motif:${theme.motif} shape:${theme.shape}`);
  console.log(`  hook: ${slides[0].title}`);
  console.log(`  -> src/data/li_carousel.json + li/post.json`);
}
main().catch((e) => { console.error("li_content failed:", e.message); process.exit(1); });
