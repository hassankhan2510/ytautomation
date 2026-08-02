/**
 * Shared builder for a proper SEO YouTube description:
 *   <keyword-rich description paragraphs>
 *   Chapters:            (long-form only, from the timeline's kicker/act markers)
 *   0:00 Intro ...
 *   Follow <BRAND>: subscribe / instagram / linkedin
 *   #hashtags (first 3 show above the title)   [+ #Shorts for shorts]
 *
 * Used by publish_kit.mjs (the .txt kit) and yt_upload.mjs (the actual upload) so both match.
 */

function fmtSec(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Build YouTube chapters from the timeline's kicker (act/section) markers. YouTube requires ≥3
// chapters, the first at 0:00, and each ≥10 seconds apart — so we force the first to 0:00 and drop
// any that land within 10s of the previous. Returns [] if fewer than 3 survive.
export function buildChapters(timeline) {
  try {
    if (!timeline) return [];
    const fps = timeline.fps || 30;
    const intro = timeline.introFrames || 0;
    const lines = timeline.lines || [];
    const raw = [];
    const seenLabel = new Set();
    for (const l of lines) {
      const label = l.kicker && String(l.kicker).trim();
      if (!label || seenLabel.has(label.toLowerCase())) continue;
      seenLabel.add(label.toLowerCase());
      raw.push({ sec: (intro + (l.startFrame || 0)) / fps, label });
    }
    if (raw.length < 3) return [];
    const out = [];
    let lastSec = -10;
    raw.forEach((c, i) => {
      const sec = i === 0 ? 0 : c.sec; // first chapter must be 0:00
      if (i > 0 && sec < lastSec + 10) return; // YouTube: chapters ≥10s apart
      out.push(`${fmtSec(sec)} ${c.label}`);
      lastSec = sec;
    });
    return out.length >= 3 ? out : [];
  } catch {
    return [];
  }
}

export function buildDescription(meta, chapters = []) {
  const brand = meta.brand || (meta.channel || "").toUpperCase();
  const isShort = ["shorts", "reel"].includes(meta.platform);
  const hashtags = (meta.hashtags || [])
    .map((h) => "#" + String(h).replace(/[^a-z0-9]/gi, ""))
    .filter((x) => x.length > 1);

  const L = meta.links || {};
  const linkLines = [];
  if (L.youtube) linkLines.push(`Subscribe: ${L.youtube}`);
  if (L.instagram) linkLines.push(`Instagram: ${L.instagram}`);
  if (L.linkedin) linkLines.push(`LinkedIn: ${L.linkedin}`);

  const parts = [String(meta.description || meta.title || "").trim()];
  if (!isShort && chapters.length >= 3) parts.push("", "Chapters:", ...chapters);
  if (linkLines.length) parts.push("", `Follow ${brand}:`, ...linkLines);
  if (meta.disclaimer && String(meta.disclaimer).trim()) parts.push("", String(meta.disclaimer).trim());
  if (hashtags.length) parts.push("", hashtags.slice(0, 8).join(" "));
  if (isShort) parts.push("#Shorts");
  return parts.join("\n").slice(0, 4900);
}
