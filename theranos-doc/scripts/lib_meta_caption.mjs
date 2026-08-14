/**
 * Captions for Facebook + Instagram, built from the job's SEO metadata.
 *
 * Instagram rewards hashtags heavily and links aren't clickable, so the IG caption leans on a
 * hook line + hashtags. Facebook keeps a clickable link and fewer hashtags. Both open with the
 * same strong first line the review pass already tightened.
 */

function hashtagList(arr, max) {
  const seen = new Set();
  return (arr || [])
    .map((h) => String(h).replace(/[^a-z0-9]/gi, ""))
    .filter((h) => h.length > 2 && !seen.has(h.toLowerCase()) && seen.add(h.toLowerCase()))
    .slice(0, max)
    .map((h) => "#" + h);
}

export function buildMetaCaptions(meta) {
  const title = String(meta.title || "").replace(/#[\w-]+/g, "").trim();
  const desc = String(meta.description || "").trim();
  const link = (meta.links && (meta.links.youtube || meta.links.instagram)) || "";
  const endsQ = /[?？]\s*$/.test(desc);
  const cta = endsQ ? "" : "What's your take? Drop a comment 👇";
  const disclaimer = meta.disclaimer ? String(meta.disclaimer).trim() : "";
  const tags = hashtagList(meta.hashtags, 15);

  // Instagram: hook + body + CTA + up to 15 hashtags (no clickable link). Cap under 2,200 chars.
  const ig = [title, desc, cta, tags.join(" "), disclaimer].filter(Boolean).join("\n\n").slice(0, 2190);
  // Facebook: hook + body + clickable link + CTA + a few hashtags. Larger limit.
  const fb = [title, desc, link ? `▶ Watch: ${link}` : "", cta, tags.slice(0, 4).join(" "), disclaimer]
    .filter(Boolean).join("\n\n").slice(0, 4900);

  return { ig, fb };
}
