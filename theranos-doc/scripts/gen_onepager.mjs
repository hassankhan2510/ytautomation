/**
 * ONE-PAGE REEL WRITER — content for the single animated card (OnePager composition), in the
 * LinkedIn-personal CREATOR style, for Cohort Zero's daily Instagram Reel.
 *
 * Picks/receives a founder-education topic, grounds it (best-effort), de-dupes against history, and
 * asks Groq for ONE sharp idea: kicker + headline + one supporting line + an optional stat. Writes:
 *   out/onepager_props.json         -> inputProps for `remotion render OnePager --props=...`
 *   jobs/<channel>_onepager.json    -> a meta block for meta_upload.mjs (caption/hashtags)
 *
 *   CHANNEL=cohortzero TOPIC="how VCs read a deck" GROQ_API_KEY=xxx node scripts/gen_onepager.mjs
 *   node scripts/gen_onepager.mjs --dry     # no API — canned sample, tests the plumbing
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { research } from "./lib_research.mjs";
import { recentTitles, appendHistory, isDuplicate, normKey } from "./lib_history.mjs";
import { news } from "./lib_live.mjs";
import { groqJSON } from "./lib_groq.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const JOBS = path.join(ROOT, "jobs");
const OUT = path.join(ROOT, "out");

const DRY = process.argv.includes("--dry");
const CHANNEL = (process.env.CHANNEL || "cohortzero").toLowerCase();
const TOPIC = process.env.TOPIC || "";
// MODE=lesson -> evergreen founder/VC lesson (scout/topic). MODE=news -> react to TODAY's real startup
// news (RSS), with a founder-relevant take. Two daily runs use the two modes for 2 posts/day.
const MODE = (process.env.ONEPAGER_MODE || "lesson").toLowerCase();

// Strip markdown the model sometimes emits (**bold**, *i*, `code`, # heads) — the card is styled, so
// raw markdown must never render as literal characters (we saw "**VCs skip fluff**" leak through).
const clean = (s) => String(s == null ? "" : s)
  .replace(/[*`~]/g, "")
  .replace(/^\s*#+\s*/, "")
  .replace(/^\s*[-•]\s*/, "")
  .replace(/\s+/g, " ")
  .trim();

// News sources for the daily NEWS post. Google News queries (global + Pakistan) PLUS direct publisher
// RSS feeds (global startup + Pakistan/MENA tech). Extend at runtime with ONEPAGER_FEEDS="url,url".
const NEWS_QUERIES = [
  "startup funding round", "venture capital", "Y Combinator", "startup launch", "startup acquisition",
  "seed round raises", "accelerator applications",
  "Pakistan startup", "Pakistan fintech funding", "Karachi startup", "Lahore startup founder",
  "Pakistan tech startup raises", "Pakistan venture capital",
];
const NEWS_FEEDS = [
  "https://techcrunch.com/category/startups/feed/",   // global startups
  "https://www.menabytes.com/feed/",                  // MENA + Pakistan startups
  "https://www.techjuice.pk/feed/",                   // Pakistan tech/startups
  "https://propakistani.pk/feed/",                    // Pakistan tech (filtered to startup items)
  "https://startuppakistan.com.pk/feed/",             // Pakistan startup ecosystem
  ...(process.env.ONEPAGER_FEEDS ? process.env.ONEPAGER_FEEDS.split(",").map((s) => s.trim()).filter(Boolean) : []),
];
// Keep only genuinely startup/VC/funding headlines (esp. from the broad Pakistan tech feeds).
const THEME = /startup|founder|fund(ing|ed|s|raise)?|raise[sd]?|seed|series\s+[a-e]\b|venture|\bvc\b|accelerat|incubat|valuation|acqui|\bipo\b|fintech|saas|angel|unicorn|pre-seed|round/i;
const PK = /pakistan|karachi|lahore|islamabad|pakistani/i;

async function fetchText(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } }); return r.ok ? await r.text() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
// Parse a generic RSS/Atom feed into { title, extract, url }[].
async function fetchFeed(url, max = 8) {
  const xml = await fetchText(url);
  if (!xml) return [];
  const un = (s) => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  return [...xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/g)].slice(0, max).map((m) => {
    const b = m[0];
    const title = un((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
    let link = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    if (!link) { const href = b.match(/<link[^>]*href=["']([^"']+)["']/); link = href ? href[1] : ""; }
    return title ? { title, extract: title, url: un(link) } : null;
  }).filter(Boolean);
}

// Pull today's freshest, non-duplicate startup/VC/founder headline across Google News + publisher
// feeds, with a light Pakistan boost (Cohort Zero's core audience). Returns { title, extract, url }.
async function pickNews() {
  const seen = new Set();
  const items = [];
  const add = (n) => { const k = normKey(n.extract || n.title); if (!k || seen.has(k)) return; seen.add(k); items.push(n); };

  const [gnews, feeds] = await Promise.all([
    Promise.all(NEWS_QUERIES.map((q) => news(q, 5).catch(() => []))),
    Promise.all(NEWS_FEEDS.map((f) => fetchFeed(f).catch(() => []))),
  ]);
  for (const list of gnews) for (const n of list) add(n);
  for (const list of feeds) for (const n of list) if (THEME.test(n.title)) add(n); // filter broad feeds
  console.log(`  news pool: ${items.length} candidates from ${NEWS_QUERIES.length} queries + ${NEWS_FEEDS.length} feeds`);

  const fresh = items.filter((n) => !isDuplicate(CHANNEL, { topic: n.extract, title: n.extract }, { days: 21, threshold: 0.55 }));
  const pool = fresh.length ? fresh : items;
  // Prefer clearly on-theme headlines, with a nudge toward Pakistan/emerging-market stories.
  const score = (n) => (THEME.test(n.extract) ? 2 : 0) + (PK.test(n.extract) ? 1 : 0);
  pool.sort((a, b) => score(b) - score(a));
  return pool[0] || null;
}

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "channels", "config.json"), "utf-8"));
  if (!cfg[CHANNEL]) { console.error(`Unknown channel "${CHANNEL}"`); process.exit(1); }
  return cfg[CHANNEL];
}

// Fetch an abstract background image from Pollinations (free, keyless, flux). Best-effort: on any
// failure we simply render without a bg (the gradient-only look). Saved into public/ for staticFile.
async function fetchBg(prompt, dest, ms = 60000) {
  const seed = Date.now() % 100000;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&nologo=true&width=1080&height=1920&seed=${seed}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 3000) return false; // too small = an error placeholder, not a real image
    fs.writeFileSync(dest, buf);
    return true;
  } catch { return false; } finally { clearTimeout(t); }
}

function drySample() {
  return {
    kicker: "FOUNDER PLAYBOOK",
    headline: "VCs decide in 3 minutes — and it's not on your numbers.",
    subline: "The first slide they scan is the problem statement. If it isn't obvious there, they stop.",
    stat: "3 min",
    statLabel: "average time a VC spends on a first deck",
    cardCta: "DM to pitch",
    title: "How VCs actually read your pitch deck",
    imagePrompt: "modern venture-capital boardroom at dusk, glass walls, city skyline behind, warm cinematic lighting, shallow depth of field, no people, no text",
    captionLines: [
      "Most decks die on slide one.",
      "VCs give you ~3 minutes. If the problem isn't undeniable up front, the numbers never get read. Lead with the pain, not the pitch.",
      "We're building Cohort Zero — founders going zero to one, together. Follow for the daily playbook, save this and send it to a founder who needs it.",
      "Building something? DM us to pitch or join our next founder session.",
      "What's the one slide you always struggle with?",
    ],
    hashtags: ["startup", "founders", "venturecapital", "pitchdeck", "fundraising", "cohortzero", "buildinpublic"],
  };
}

async function main() {
  const cfg = loadConfig();
  fs.mkdirSync(JOBS, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  let topic = TOPIC || "";
  let grounding = "";
  let modeRule = "";
  let newsUrl = "";

  if (MODE === "news") {
    // NEWS post: react to a real, fresh startup/VC headline with a founder-relevant take.
    const n = DRY
      ? { extract: "Google opens its first Pakistan office in Lahore (Reuters)", url: "https://example.com" }
      : await pickNews();
    if (!n) { console.error("  ! no fresh startup news found right now — skipping this run."); process.exit(1); }
    topic = n.extract;
    newsUrl = n.url || "";
    grounding = `\nNEWS ITEM (base the post ONLY on this real headline — do NOT invent figures, quotes, or details not in it):\n- ${n.extract}${n.url ? `\n  Source: ${n.url}` : ""}`;
    modeRule = `\nThis is a BREAKING-NEWS reaction post: give a sharp, founder-relevant TAKE on the news above — what it means for builders/founders — not a rehash of the headline. kicker like "JUST IN" or "STARTUP NEWS".`;
    console.log(`  news: "${topic.slice(0, 70)}"`);
  } else {
    // LESSON post: evergreen founder/VC lesson. Grounding best-effort (soft-ground channel).
    let g = [];
    if (cfg.ground && topic && !DRY) {
      try { g = (await research(topic, { niche: cfg.niche })).items || []; }
      catch (e) { console.log(`  ! research failed (${e.message})`); }
    }
    grounding = g.length
      ? "\nGROUNDING (base facts ONLY on this; do not invent specifics):\n" + g.map((x) => `- ${x.title ? x.title + ": " : ""}${x.extract}`).join("\n").slice(0, 2200)
      : "";
  }

  const avoid = recentTitles(CHANNEL, 45).slice(-20);
  const avoidRule = avoid.length ? `\nFRESHNESS: do NOT repeat or reword any of these recent posts:\n${JSON.stringify(avoid)}` : "";
  const steer = cfg.steer ? `\nEDITORIAL DIRECTION (follow exactly): ${cfg.steer}` : "";

  const sys =
    `You write ONE single-card Instagram Reel for "Cohort Zero" — a founder COMMUNITY brand (founders ` +
    `going zero to one, together). It is ONE idea that stops the scroll and teaches something real in ` +
    `one screen, and it must make founders want to FOLLOW, SAVE, SHARE and DM. Return ONLY JSON: ` +
    `{"kicker": string, "headline": string, "subline": string, "stat"?: string, "statLabel"?: string, ` +
    `"cardCta": string, "title": string, "captionLines": string[4-6], "imagePrompt": string, ` +
    `"hashtags": string[6-10]}. ` +
    `FORMATTING: plain text only — NO markdown (**, *, _, #, backticks), NO emojis in kicker/headline/` +
    `subline. ` +
    `imagePrompt = a short prompt for a RELEVANT, realistic, cinematic BACKGROUND photo for this exact ` +
    `topic (e.g. a modern VC boardroom, a startup office, a founder at a laptop, a city skyline, a ` +
    `specific setting the topic implies). Dark/moody, premium, shallow depth of field, no text, no ` +
    `readable logos, no close-up faces. NOT abstract sci-fi. ` +
    `RULES: headline <= 90 chars, one bold, specific, curiosity-driving idea (front-load the hook). ` +
    `subline <= 150 chars, one concrete supporting sentence with a real specific. kicker = 1-3 word mono ` +
    `label. stat = a SHORT real figure from the grounding if one fits ("3 min", "90%"), else omit stat ` +
    `AND statLabel. cardCta = <= 18 chars on-card nudge ("follow @cohortzero", "save this", "DM to pitch"). ` +
    `ANTI-HALLUCINATION: every number/name must come from the grounding; if none supports a figure, omit ` +
    `the stat rather than invent one. captionLines = an Instagram caption as an ARRAY of 4-6 SHORT ` +
    `standalone lines (NO newline characters inside any line): line 1 a punchy hook, next 1-2 lines the ` +
    `insight with a real specific, then a COMMUNITY call to action — invite founders to follow for the ` +
    `daily playbook, save + send it to a founder who needs it, and DM to pitch a startup or join our ` +
    `founder sessions — and the LAST line a genuine question that invites replies. Warm, sharp, ` +
    `peer-to-peer; never corporate or salesy. hashtags = 6-10 founder/startup/VC + ` +
    `community tags (mix broad + niche; include a couple Pakistan / emerging-market ones when relevant).` +
    `${steer}${modeRule}${avoidRule}`;
  const usr = `TOPIC: ${topic || "(choose one sharp, specific founder/VC lesson in this niche)"}${grounding}\nWrite the card now.`;

  let m;
  if (DRY) m = drySample();
  else {
    // gpt-oss reasons before answering, so give the JSON room — a tight cap truncates it and Groq's
    // json_object validator then 400s (json_validate_failed).
    m = await groqJSON(sys, usr, { maxTokens: 2200, temperature: 0.6 });
    if (!m || !m.headline) { console.error("  ! Groq returned no usable card — re-run."); process.exit(1); }
  }

  // De-dup: if this headline repeats a recent post, ask once for a different angle.
  if (!DRY) {
    const dup = isDuplicate(CHANNEL, { topic: topic || m.title, title: m.headline }, { days: 45, threshold: 0.6 });
    if (dup) {
      console.log(`  ! duplicate of "${String(dup.title).slice(0, 50)}" — re-angling`);
      const r = await groqJSON(sys, `${usr}\nThe angle "${m.headline}" is too similar to a past post — pick a genuinely DIFFERENT angle.`, { maxTokens: 2200, temperature: 0.7 });
      if (r && r.headline) m = r;
    }
  }

  const accent = cfg.accentColor || "#e11d48";
  const name = process.env.ONEPAGER_NAME || cfg.brand?.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || "Cohort Zero";
  const at = process.env.ONEPAGER_AT || (cfg.links?.instagram ? "@" + cfg.links.instagram.replace(/\/+$/, "").split("/").pop() : "@cohort_zero");
  // Default to the committed Cohort Zero logo as the avatar (contain-fit on a dark disc, not cropped).
  const avatar = process.env.ONEPAGER_AVATAR || (CHANNEL === "cohortzero" ? "cohortzero-logo.png" : "");
  const avatarFit = avatar && /logo|mark|icon/i.test(avatar) ? "contain" : "cover";

  // RELEVANT AI background (best-effort, off with ONEPAGER_BG=0): a realistic scene for THIS topic
  // (a VC office, a founder's desk, a skyline) — dark & premium so text reads. Model-chosen prompt.
  let bg = "";
  if (!DRY && process.env.ONEPAGER_BG !== "0") {
    const bgPrompt = clean(m.imagePrompt) ||
      "modern startup office at dusk, glass walls, city skyline behind, warm cinematic lighting, shallow depth of field, no people, no text, no logos";
    const ok = await fetchBg(`${bgPrompt}, dark moody premium background, cinematic, no text, no watermark`, path.join(ROOT, "public", "onepager_bg.jpg"));
    if (ok) { bg = "onepager_bg.jpg"; console.log(`  bg: relevant AI background generated ("${bgPrompt.slice(0, 60)}")`); }
    else console.log("  ! bg image unavailable — rendering gradient-only");
  }

  const props = {
    brand: cfg.brand || CHANNEL.toUpperCase(),
    name, at, accent,
    ...(avatar ? { avatar, avatarFit } : {}),
    ...(bg ? { bg } : {}),
    kicker: clean(m.kicker || cfg.tagline || "").slice(0, 32),
    headline: clean(m.headline).slice(0, 120),
    subline: clean(m.subline).slice(0, 180),
    ...(m.stat ? { stat: clean(m.stat).slice(0, 12), statLabel: clean(m.statLabel).slice(0, 80) } : {}),
    footer: (cfg.brand || CHANNEL).toUpperCase(),
    cta: clean(m.cardCta || "follow").slice(0, 22),
    ...(process.env.ONEPAGER_MUSIC ? { music: process.env.ONEPAGER_MUSIC } : {}),
  };
  fs.writeFileSync(path.join(OUT, "onepager_props.json"), JSON.stringify(props, null, 2));

  // Caption kit for meta_upload.mjs (reads .meta).
  const hashtags = (Array.isArray(m.hashtags) ? m.hashtags : []).map((h) => String(h).replace(/^#/, "")).filter(Boolean).slice(0, 8);
  const job = {
    meta: {
      title: m.title || m.headline,
      // The IG-native community caption IS the description; meta_upload appends hashtags + (only if it
      // doesn't already end with a question) a generic prompt — ours ends with a question, so ours wins.
      description: ((Array.isArray(m.captionLines) && m.captionLines.length
        ? m.captionLines.map((s) => clean(s)).filter(Boolean).join("\n\n")
        : clean(m.caption || m.subline || "")) + (newsUrl ? `\n\nSource: ${newsUrl}` : "")),
      hashtags: hashtags.length ? hashtags : ["startup", "founders", "cohortzero", "buildinpublic"],
      channel: CHANNEL, niche: cfg.niche, brand: cfg.brand, platform: "reel",
      links: cfg.links || null,
      disclaimer: cfg.disclaimer || "",
    },
  };
  const jobPath = path.join(JOBS, `${CHANNEL}_onepager.json`);
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));

  // Record for dedup. In news mode also record the source headline so the same story can't re-post.
  if (!DRY) appendHistory(CHANNEL, { topic: topic || m.title || m.headline, title: m.headline });

  console.log(`  + out/onepager_props.json  ("${props.headline.slice(0, 60)}")`);
  console.log(`  + ${path.relative(ROOT, jobPath)}`);
  console.log(`\nRender:  npx remotion render OnePager out/${CHANNEL}_onepager.mp4 --props=out/onepager_props.json`);
}

main().catch((e) => { console.error("gen_onepager failed:", e.message); process.exit(1); });
