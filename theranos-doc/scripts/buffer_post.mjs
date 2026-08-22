/**
 * BUFFER POSTER — publish a native TEXT post to a Buffer-connected channel (LinkedIn Page, X, …) via
 * Buffer's free GraphQL API. Buffer is an approved LinkedIn partner, so this needs NO LinkedIn App
 * Review and NO token juggling on LinkedIn's side. Gated on BUFFER_ACCESS_TOKEN; if unset it no-ops
 * (non-fatal) — same safe pattern as the Meta/LinkedIn uploaders.
 *
 * Text is the caption; the card IMAGE (via --image) is hosted on a public GitHub Release and attached
 * through Buffer's asset-URL model (Buffer can't take a raw upload — it pulls media from a URL). PDFs
 * aren't supported by the API, so LinkedIn carousels stay a manual/dashboard job.
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
import { hostFile } from "./lib_ghhost.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API = "https://api.buffer.com";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const DRY = process.argv.includes("--dry");
const LIST = process.argv.includes("--list");
const CHANNEL = (arg("channel", "") || "").toLowerCase();
const PROPS = arg("props", "");
const SCRIPT = arg("script", "");
const IMAGE = arg("image", "");         // one local PNG/JPG (single-image post)
const IMAGES = arg("images", "");       // comma-separated list (multi-image gallery)
const IMAGEGLOB = arg("imageglob", ""); // e.g. out/syndar_slide_*.jpg -> a carousel gallery (up to 20)
const TOKEN = process.env.BUFFER_ACCESS_TOKEN || "";

// Which LinkedIn page a channel maps to (match on the Buffer channel's display name / handle).
const BRAND_MATCH = { cohortzero: /cohort/i, equitier: /equitier/i, syndar: /syndar/i };

function readJSON(p) { try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, p), "utf-8")); } catch { return null; } }
function skip(msg) { console.log(`buffer post skipped: ${msg}`); process.exit(0); } // never fail the pipeline

// Resolve the images to attach: --image (one), --images=a,b,c, and/or --imageglob=dir/prefix*.jpg.
// LinkedIn galleries take up to 20; existing files only, numeric-sorted, de-duped.
function resolveImages() {
  const list = [];
  if (IMAGE) list.push(IMAGE);
  if (IMAGES) list.push(...IMAGES.split(",").map((s) => s.trim()).filter(Boolean));
  if (IMAGEGLOB) {
    const dir = path.dirname(IMAGEGLOB);
    const rx = new RegExp("^" + path.basename(IMAGEGLOB).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
    try {
      fs.readdirSync(path.resolve(ROOT, dir))
        .filter((f) => rx.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .forEach((f) => list.push(path.join(dir, f)));
    } catch { /* dir missing → no gallery */ }
  }
  return [...new Set(list)].filter((p) => fs.existsSync(path.resolve(ROOT, p))).slice(0, 20);
}

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

// All connected channels, flattened across organizations. The nested account.organizations.channels
// path is FORBIDDEN for API tokens, so use the dedicated top-level `channels(input:{organizationId})`
// query (authorized differently) — one call per organization.
async function listChannels() {
  const d = await gql(`query { account { organizations { id } } }`, {});
  const orgs = d?.account?.organizations || [];
  const out = [];
  for (const o of orgs) {
    try {
      const c = await gql(`query($orgId: OrganizationId!){ channels(input: { organizationId: $orgId }) { id name service displayName } }`, { orgId: o.id });
      for (const ch of c?.channels || []) out.push({ ...ch, organizationId: o.id });
    } catch (e) { console.log(`  ! channels query failed for org ${o.id}: ${e.message}`); }
  }
  return out;
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

  // Attach image(s): Buffer pulls media from a public URL, so host each first. One image = single
  // post; several = a LinkedIn gallery/carousel (the no-PDF workaround).
  let assets = [];
  const altText = tidy(props?.headline || meta?.title || brand).slice(0, 300) || brand;
  const imgs = resolveImages();
  for (const rel of imgs) {
    try {
      const { url } = await hostFile(path.resolve(ROOT, rel), `${CHANNEL}_li`, (rel.split(".").pop() || "png").toLowerCase());
      assets.push({ image: { url, metadata: { altText } } });
    } catch (e) { console.log(`  ! image host failed for ${rel} (${e.message})`); }
  }
  if (imgs.length) console.log(`  attached ${assets.length}/${imgs.length} image(s)${assets.length > 1 ? " as a gallery" : ""}`);
  else console.log("  (text-only post — no images given)");

  const input = { channelId, text, assets, needsApproval: false, saveToDraft: process.env.BUFFER_DRAFT === "1", mode, schedulingType };
  if (/at.?time|custom|scheduled/i.test(mode)) input.dueAt = new Date(Date.now() + 120000).toISOString();

  try {
    // createPost returns the PostActionPayload UNION — select the post via an inline fragment on the
    // success member (PostActionSuccess); __typename tells us if it came back as a non-success variant.
    const d = await gql(
      `mutation($input: CreatePostInput!){ createPost(input: $input){ __typename ... on PostActionSuccess { post { id } } } }`,
      { input },
    );
    const r = d?.createPost;
    if (r?.post?.id) console.log(`  ✓ Buffer post created (id ${r.post.id}) for ${CHANNEL}`);
    else console.log(`  ! Buffer createPost returned ${r?.__typename || "unknown"} (no post id) — check Buffer dashboard`);
  } catch (e) {
    console.log(`  ! Buffer post failed (non-fatal): ${e.message}`);
  }
}

main().catch((e) => { console.log(`buffer post error (non-fatal): ${e.message}`); process.exit(0); });
