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

// Pick a background music track by ROTATION over public/music/ (never fixed). Only uses files YOU put
// there — nothing is fetched or chosen automatically — so your "no haram" line stays yours to control.
// ONEPAGER_MUSIC pins a single track; empty folder => silent.
function pickMusic() {
  if (process.env.ONEPAGER_MUSIC) return process.env.ONEPAGER_MUSIC;
  try {
    const tracks = fs.readdirSync(path.join(ROOT, "public", "music")).filter((f) => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f));
    if (!tracks.length) return "";
    // Vary by day + a random offset so the day's two posts don't land on the same track.
    const idx = (Math.floor(Date.now() / 86400000) + Math.floor(Math.random() * tracks.length)) % tracks.length;
    return tracks[idx];
  } catch { return ""; }
}

// Human descriptor + community CTA per channel, so the generator works for ANY channel (not just
// Cohort Zero) — the prompt was previously hardcoded to Cohort Zero.
const NICHE_DESC = { finance: "money & investing", business: "founder & startup", deeptech: "deep-tech / physical-AI", facts: "science & tech" };
const COMMUNITY = {
  cohortzero: "a community of founders going zero to one — invite founders to follow for the daily playbook, save + send it to a founder who needs it, and DM to pitch a startup or join a founder session",
  equitier: "an honest money & investing community — invite people to follow for daily wealth clarity, save + send it to someone who needs to hear it, and share it",
};
// QUOTE-mode angles: rotated per run so the shareable wisdom posts stay fresh (dedup catches repeats).
const QUOTE_THEMES = {
  finance: [
    "owning your time is the real wealth flex, not things", "your net worth is what you keep, not what you buy",
    "invisible wealth beats visible status symbols", "escaping lifestyle inflation", "patience and compounding",
    "financial peace over financial flexing", "assets that pay you vs liabilities that drain you",
    "stop buying things to impress people you don't like", "a calendar full of blank spaces is freedom",
    "boring consistency beats get-rich-quick",
  ],
  business: [
    "paying customers over vanity metrics", "execution beats planning", "failure is data, not the opposite of success",
    "selling over playing business", "solving a real problem over looking like a founder",
    "speed of iteration over perfection", "cash flow over hype", "distribution over product",
    "focus over hustle theater", "start before you feel ready",
  ],
  default: ["discipline over motivation", "consistency compounds", "focus beats intensity", "who you become over what you get"],
};
// Equitier "lesson" = shareable MARKET-PSYCHOLOGY insights (name a real trap people recognize in
// themselves), not dry mechanics — the kind that gets reposted. Rotated per run; dedup stops repeats.
const FINANCE_INSIGHTS = [
  "recency bias — assuming yesterday's trend guarantees tomorrow's gains",
  "perverse incentives — overtrading out of boredom in a flat market",
  "revenge trading — doubling your size to win back a loss",
  "the danger of your FIRST big win (luck mistaken for skill)",
  "time in the market beats timing the market (missing the 10 best days)",
  "loss aversion — cutting winners early, clinging to losers",
  "FOMO — the public gets greedy right before the crash",
  "anchoring to your entry price instead of the current setup",
  "survivorship bias — you only hear about the winners",
  "the disposition effect — selling gains, holding losses",
  "why doing nothing is often the highest-yielding trade",
  "arrogance gets you liquidated; humility keeps you in the game",
];

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

  const nicheDesc = NICHE_DESC[cfg.niche] || cfg.niche;
  const community = COMMUNITY[CHANNEL] || `follow ${cfg.brand} for more, save it, and send it to a friend`;

  let topic = TOPIC || "";
  let grounding = "";
  let modeRule = "";
  let newsUrl = "";

  if (MODE === "quote") {
    // QUOTE / WISDOM post: one original, highly shareable truth people repost + send to a friend.
    const pool = QUOTE_THEMES[cfg.niche] || QUOTE_THEMES.default;
    const theme = pool[Math.floor(Math.random() * pool.length)];
    topic = theme;
    modeRule = `\nThis is a QUOTE / WISDOM reel — the ENTIRE post is ONE original, highly shareable ${nicheDesc} truth that people REPOST and send to a friend. Angle for THIS one: "${theme}". Write 2-4 short, punchy, quotable sentences — plain, emotional, memorable; NO jargon, NO statistics, NO fake attributions. Put the sharpest 1-2 sentences in "headline" and the rest of the quote in "subline". kicker = a 1-2 word label (e.g. WEALTH, MINDSET, TRUTH, MONEY). Do NOT include stat/statLabel. Classy and universally relatable — never crude, never get-rich-quick hype.`;
    console.log(`  quote angle: ${theme}`);
  } else if (MODE === "news") {
    // NEWS post: react to a real, fresh startup/VC headline with a founder-relevant take.
    const n = DRY
      ? { extract: "Google opens its first Pakistan office in Lahore (Reuters)", url: "https://example.com" }
      : await pickNews();
    if (!n) { console.error("  ! no fresh startup news found right now — skipping this run."); process.exit(1); }
    topic = n.extract;
    newsUrl = n.url || "";
    grounding = `\nNEWS ITEM (base the post ONLY on this real headline — do NOT invent figures, quotes, or details not in it):\n- ${n.extract}${n.url ? `\n  Source: ${n.url}` : ""}`;
    modeRule = `\nThis is a BREAKING-NEWS reaction post — but make it LIKABLE and SHAREABLE, the kind of news-take founders screenshot and send to each other. Do NOT rehash the headline: pull out the lesson, the surprising angle, or what it really means for builders, and land it so it resonates emotionally (a "this changes things / here's what nobody's saying" energy). kicker like "JUST IN" or "STARTUP NEWS".`;
    console.log(`  news: "${topic.slice(0, 70)}"`);
  } else if (MODE === "lesson" && cfg.niche === "finance") {
    // Equitier LESSON = a shareable market-psychology insight (names a real trap), NOT dry mechanics.
    const pool = FINANCE_INSIGHTS;
    const theme = pool[Math.floor(Math.random() * pool.length)];
    topic = theme;
    modeRule = `\nThis is a shareable MARKET-PSYCHOLOGY INSIGHT reel — the kind people REPOST and send to a friend because it names a trap they recognize in THEMSELVES. Angle: "${theme}". NAME the concept (e.g. recency bias, perverse incentive, revenge trading, disposition effect) and teach it in 3-5 short, punchy, story-like sentences ending on a memorable, counterintuitive truth. headline = the sharp hook; subline = the rest. kicker = 1-2 words (PSYCHOLOGY, BIAS, MINDSET, MONEY). Do NOT invent precise statistics (a single universally-known market truism like "missing the 10 best days can halve your returns" is fine); otherwise stay qualitative. Match THIS voice exactly:\n- "The most dangerous moment isn't your first big loss — it's your first big win. Your brain mistakes luck for skill, you scale up, and the market wipes you out."\n- "Waiting for the perfect time to invest costs more than a crash. Miss just the 10 best days over 20 years and your returns get cut in half. Time in the market beats timing the market."\n- "Market flat? You overtrade out of boredom. Just took a loss? You double down to win it back. Sometimes the highest-yielding trade is sitting on your hands."`;
    console.log(`  finance insight: ${theme}`);
  } else {
    // LESSON post (non-finance, e.g. Cohort Zero): evergreen lesson, best-effort grounding.
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
    `You write ONE single-card Instagram Reel for "${cfg.brand}" — a ${nicheDesc} brand. It is ONE idea ` +
    `that stops the scroll in one screen and makes people want to FOLLOW, SAVE and SHARE. SHAREABILITY ` +
    `is the #1 goal: land a counterintuitive truth or name a trap the reader recognizes in THEMSELVES — ` +
    `the kind of post people screenshot, repost, and send to a friend. Return ONLY ` +
    `JSON: {"kicker": string, "headline": string, "subline": string, "stat"?: string, ` +
    `"statLabel"?: string, "cardCta": string, "title": string, "captionLines": string[4-6], ` +
    `"imagePrompt": string, "hashtags": string[6-10]}. ` +
    `FORMATTING: plain text only — NO markdown (**, *, _, #, backticks), NO emojis in kicker/headline/subline. ` +
    `imagePrompt = a short prompt for a RELEVANT, realistic, cinematic BACKGROUND photo for this exact ` +
    `topic (a fitting real setting the topic implies — office, city skyline, a desk, money/time imagery). ` +
    `Dark/moody, premium, shallow depth of field, no text, no readable logos, no close-up faces. NOT ` +
    `abstract sci-fi. ` +
    `RULES: headline <= 100 chars, the sharpest hook, front-loaded. subline <= 220 chars. kicker = 1-3 ` +
    `word mono label. stat = a SHORT real figure from the grounding if one truly fits, else omit stat ` +
    `AND statLabel. cardCta = <= 18 chars on-card nudge ("follow", "save this", "send this"). ` +
    `ANTI-HALLUCINATION: any number/name must come from the grounding; if none supports a figure, omit the ` +
    `stat rather than invent one — and never fabricate a quote or an attribution. captionLines = an ` +
    `Instagram caption as an ARRAY of 4-6 SHORT standalone lines (NO newline characters inside any line): ` +
    `a punchy hook, the point in 1-2 lines, then a call to action for ${community}, and the LAST line a ` +
    `genuine question that invites replies. Warm, sharp, human; never corporate or salesy. hashtags = ` +
    `6-10 clean, relevant tags (mix broad + niche; a couple Pakistan/emerging-market ones when relevant); ` +
    `never vulgar or spammy.` +
    `${steer}${modeRule}${avoidRule}`;
  const usr = `TOPIC / ANGLE: ${topic || "(choose one sharp, specific angle in this niche)"}${grounding}\nWrite the card now.`;

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
  // Default to the committed channel logo as the avatar (contain-fit on a dark disc, not cropped).
  const logoFile = path.join(ROOT, "public", `${CHANNEL}-logo.png`);
  const avatar = process.env.ONEPAGER_AVATAR || (fs.existsSync(logoFile) ? `${CHANNEL}-logo.png` : "");
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

  // MUSIC: rotate over the tracks YOU place in public/music/ (curate them yourself — nothing is added
  // or fetched automatically, so your line is respected). ONEPAGER_MUSIC pins one; otherwise a track is
  // picked by rotation so it's never fixed. Silent if the folder has no audio.
  const music = pickMusic();
  if (music) console.log(`  music: ${music}`); else console.log("  music: none (add tracks to public/music/ to enable)");

  const props = {
    brand: cfg.brand || CHANNEL.toUpperCase(),
    name, at, accent,
    ...(avatar ? { avatar, avatarFit } : {}),
    ...(bg ? { bg } : {}),
    kicker: clean(m.kicker || cfg.tagline || "").slice(0, 32),
    headline: clean(m.headline).slice(0, 150),
    subline: clean(m.subline).slice(0, 260),
    ...(m.stat ? { stat: clean(m.stat).slice(0, 12), statLabel: clean(m.statLabel).slice(0, 80) } : {}),
    footer: (cfg.brand || CHANNEL).toUpperCase(),
    cta: clean(m.cardCta || "follow").slice(0, 22),
    ...(music ? { music } : {}),
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
