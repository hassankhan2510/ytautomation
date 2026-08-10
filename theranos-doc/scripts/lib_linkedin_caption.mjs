/**
 * LINKEDIN CAPTION — built for organic reach on a Company Page.
 *
 * LinkedIn's feed rewards: a strong first line (the only thing shown before "…see more"), scannable
 * short lines, keyword relevance, a comment-driving CTA (comments = reach), and a SMALL set of
 * focused hashtags (LinkedIn's own guidance is 3–5, not 30). We reuse the video's SEO metadata so
 * the caption matches the title/hook the review pass already tightened.
 */

export function buildLinkedInCaption(meta, { maxHashtags = 5, linkInComment = false } = {}) {
  const title = String(meta.title || "").replace(/#[\w-]+/g, "").trim();
  const desc = String(meta.description || "").trim();

  // 3–5 specific hashtags, de-duped, PascalCase preserved from the source tokens.
  const seen = new Set();
  const tags = (meta.hashtags || [])
    .map((h) => String(h).replace(/[^a-z0-9]/gi, ""))
    .filter((h) => h.length > 2 && !seen.has(h.toLowerCase()) && seen.add(h.toLowerCase()))
    .slice(0, maxHashtags)
    .map((h) => "#" + h);

  const L = meta.links || {};
  const link = L.youtube || L.instagram || "";
  const endsWithQ = /[?？]\s*$/.test(desc);

  const parts = [];
  parts.push(title); // the hook — first line, before "…see more"
  if (desc) parts.push("", desc); // keyword-rich SEO body
  if (!endsWithQ) parts.push("", "What's your take? Tell me in the comments 👇");
  if (link && !linkInComment) parts.push("", `▶ Watch the full video: ${link}`);
  if (meta.disclaimer && String(meta.disclaimer).trim()) parts.push("", String(meta.disclaimer).trim());
  if (tags.length) parts.push("", tags.join(" "));

  const caption = parts.join("\n").slice(0, 2900); // LinkedIn hard limit is 3000 chars
  // When linkInComment, the caller posts this as the first comment (feed-friendly: keeps the external
  // link out of the post body, which LinkedIn tends to down-rank).
  const firstComment = link && linkInComment ? `Full video here 👉 ${link}` : "";
  return { caption, firstComment };
}
