/**
 * BUFFER POSTER — publish a native TEXT post to a Buffer-connected channel (LinkedIn Page, X, …) via
 * Buffer's free GraphQL API. Buffer is an approved LinkedIn partner, so this needs NO LinkedIn App
 * Review and NO token juggling on LinkedIn's side. Gated on BUFFER_ACCESS_TOKEN; if unset it no-ops
 * (non-fatal) — same safe pattern as the Meta/LinkedIn uploaders.
 *
 * Buffer's public API can't upload media yet, so this posts TEXT — which is LinkedIn's strongest format
 * anyway (hook + whitespace + a question drives reach, comments, reposts). The card image still goes to
 * Instagram; LinkedIn gets the written version.
 *
 *   node scripts/buffer_post.mjs --channel=equitier  --props=out/onepager_props.json --script=jobs/equitier_onepager.json
 *   node scripts/buffer_post.mjs --channel=syndar    --script=jobs/syndar.json      # from a video job's meta
 *   node scripts/buffer_post.mjs --list                                            # print connected channels (debug)
 *   node scripts/buffer_post.mjs --channel=equitier --props=... --dry              # build text, post nothing
 *
 * Env: BUFFER_ACCESS_TOKEN (required to post). Optional: BUFFER_CHANNEL_ID_<CH> (pin the exact channel
 * id), BUFFER_MODE / BUFFER_SCHEDULING (pin the enum values if the auto-pick is wrong), BUFFER_DRAFT=1
 * (queue as a draft for manual approval instead of auto-publishing).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API = "https://api.buffer.com";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const DRY = process.argv.includes("--dry");
const LIST = process.argv.includes("--list");
const CHANNEL = (arg("channel", "") || "").toLowerCase();
const PROPS = arg("props", "");
const SCRIPT = arg("script", "");
const TOKEN = process.env.BUFFER_ACCESS_TOKEN || "";

// Which LinkedIn page a channel maps to (match on the Buffer channel's display name / handle).
const BRAND_MATCH = { cohortzero: /cohort/i, equitier: /equitier/i, syndar: /syndar/i };

function readJSON(p) { try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, p), "utf-8")); } catch { return null; } }
function skip(msg) { console.log(`buffer post skipped: ${msg}`); process.exit(0); } // never fail the pipeline

async function gql(query, variables) {
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.errors) throw new Error(`Buffer ${r.status}: ${JSON.stringify((j && j.errors) || j || {}).slice(0, 300)}`);
  return j.data;
}

// All connected channels, flattened across organizations.
async function listChannels() {
  const d = await gql(`query { account { organizations { id channels { id name service displayName } } } }`, {});
  const orgs = d?.account?.organizations || [];
  return orgs.flatMap((o) => (o.channels || []).map((c) => ({ ...c, organizationId: o.id })));
}

// Introspect an enum's values so we don't hardcode names the docs hide; pick by meaning.
async function enumValues(name) {
  try { const d = await gql(`query($n:String!){ __type(name:$n){ enumValues { name } } }`, { n: name }); return (d?.__type?.enumValues || []).map((e) => e.name); }
  catch { return []; }
}
const pick = (vals, prefs, envVal) => {
  if (envVal && vals.includes(envVal)) return envVal;
  for (const p of prefs) { const m = vals.find((v) => p.test(v)); if (m) return m; }
  return vals[0];
};

/* ---------- compose a LinkedIn-native TEXT post ---------- */
function tidy(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
function buildText({ props, meta, brand }) {
  const hook = tidy(props?.headline || meta?.title || "");
  let body = tidy(props?.subline || "");
  if (!body && meta?.description) body = tidy(meta.description).split(/(?<=[.?!])\s+/).slice(0, 3).join(" ");
  const tags = (Array.isArray(meta?.hashtags) ? meta.hashtags : [])
    .map((h) => "#" + String(h).replace(/[^A-Za-z0-9]/g, "")).filter((h) => h.length > 2).slice(0, 5).join(" ");
  const endsQ = /[?？]\s*$/.test(body);
  const parts = [
    hook,
    body,
    endsQ ? "" : "What's your take?",
    `♻️ Repost if this resonated — and follow ${brand} for more.`,
    tags,
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 2900); // LinkedIn hard limit is ~3000 chars
}

async function main() {
  if (!TOKEN) skip("BUFFER_ACCESS_TOKEN not set");

  if (LIST) {
    const chans = await listChannels();
    console.log("Buffer channels:");
    chans.forEach((c) => console.log(`  ${c.service.padEnd(10)} ${c.id}  ${c.displayName || c.name}`));
    return;
  }

  if (!CHANNEL) skip("no --channel given");
  const props = PROPS ? readJSON(PROPS) : null;
  const scriptJob = SCRIPT ? readJSON(SCRIPT) : null;
  const meta = scriptJob?.meta || {};
  const brand = props?.brand || meta.brand || CHANNEL.toUpperCase();

  const text = buildText({ props, meta, brand });
  if (!text || text.length < 20) skip("no content to post");
  console.log(`  buffer text (${text.length} chars):\n${text.split("\n").map((l) => "    " + l).join("\n")}`);
  if (DRY) { console.log("  (dry) not posting"); return; }

  // Resolve the target channel id.
  let channelId = process.env[`BUFFER_CHANNEL_ID_${CHANNEL.toUpperCase()}`] || "";
  let organizationId = "";
  const chans = await listChannels();
  if (!channelId) {
    const rx = BRAND_MATCH[CHANNEL] || new RegExp(CHANNEL, "i");
    const li = chans.filter((c) => /linkedin/i.test(c.service));
    const hit = (li.find((c) => rx.test(c.displayName || c.name)) || li[0]);
    if (!hit) { console.log(`  ! no LinkedIn channel matched "${CHANNEL}". Connected:`); chans.forEach((c) => console.log(`    ${c.service} ${c.id} ${c.displayName || c.name}`)); skip("channel not found"); }
    channelId = hit.id; organizationId = hit.organizationId;
    console.log(`  -> channel ${channelId} (${hit.displayName || hit.name})`);
  } else {
    organizationId = (chans.find((c) => c.id === channelId) || {}).organizationId || "";
  }

  // Discover enum values (names differ across API versions) and pick the auto-publish / post-now ones.
  const [modes, scheds] = await Promise.all([enumValues("ShareMode"), enumValues("SchedulingType")]);
  const schedulingType = pick(scheds, [/auto/i, /automatic/i], process.env.BUFFER_SCHEDULING);
  const mode = pick(modes, [/now|immediate|direct/i, /queue/i, /at.?time|custom|scheduled/i], process.env.BUFFER_MODE);
  if (!schedulingType || !mode) skip(`could not resolve enums (ShareMode=${modes}, SchedulingType=${scheds})`);
  console.log(`  mode=${mode} schedulingType=${schedulingType}`);

  const input = { channelId, text, assets: [], needsApproval: false, saveToDraft: process.env.BUFFER_DRAFT === "1", mode, schedulingType };
  if (/at.?time|custom|scheduled/i.test(mode)) input.dueAt = new Date(Date.now() + 120000).toISOString();

  try {
    const d = await gql(`mutation($input: CreatePostInput!){ createPost(input: $input){ post { id } } }`, { input });
    console.log(`  ✓ Buffer post created (id ${d?.createPost?.post?.id || "?"}) for ${CHANNEL}`);
  } catch (e) {
    console.log(`  ! Buffer post failed (non-fatal): ${e.message}`);
  }
}

main().catch((e) => { console.log(`buffer post error (non-fatal): ${e.message}`); process.exit(0); });
