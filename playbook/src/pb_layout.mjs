/**
 * PHASE 6 — LAYOUT (the algorithmic "Vogue" engine).
 *
 * Assembles the Spine into one print-ready HTML document with an editorial design system. KEY design
 * choice: front matter + chapter dividers are full "sheets" (break-before/after), but SECTIONS FLOW
 * continuously like a real book — so a section running one line long never dumps an orphan onto a blank
 * page. Page margins come from the PDF renderer (uniform on every page), so text is never full-bleed and
 * never borderless. Inline evidence tags like "(E21)" are stripped from the visible prose.
 *
 *   PB_ID=gnn node src/pb_layout.mjs   ->  runs/<id>/book.html
 */
import fs from "node:fs";
import { allSections, evidenceMap } from "./pb_schema.mjs";
import { diagram as diagramPrim } from "./pb_graphics_lib.mjs";
import { loadSpine, saveSpine, runPaths, escapeHtml, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

// Strip inline "(E3)" / "(E3, E7)" citation tags — the ids live in the JSON, they must not show in prose.
const clean = (s) => escapeHtml(String(s == null ? "" : s).replace(/\s*\((?:E\d+)(?:\s*,\s*E\d+)*\)/g, "").replace(/\s{2,}/g, " ").trim());
const shortLabel = (s, words = 2) => String(s || "").split(/[:—-]/)[0].trim().split(/\s+/).slice(0, words).join(" ");

function figureBlock(spine, section) {
  const g = spine.graphics?.[section.id];
  if (!g) return "";
  const inner = g.svg ? `<div class="svgwrap">${g.svg}</div>` : g.imagePath ? `<img class="figimg" src="${escapeHtml(g.imagePath)}" alt="${escapeHtml(g.caption || "")}"/>` : "";
  if (!inner) return "";
  const srcIds = section.visual?.evidenceIds || section.evidenceIds || [];
  const emap = evidenceMap(spine);
  const srcs = [...new Set(srcIds.map((id) => emap.get(id)?.source).filter(Boolean))];
  const cap = g.caption ? `<figcaption><span class="fignum">Fig.</span> ${clean(g.caption)}${srcs.length ? ` — <span class="figsrc">${escapeHtml(srcs.join(", "))}</span>` : ""}</figcaption>` : "";
  return `<figure class="fig">${inner}${cap}</figure>`;
}

function sectionBlock(spine, chapter, section) {
  const paras = section.content?.paragraphs || [];
  const lead = paras[0], rest = paras.slice(1);
  const pull = section.content?.pullQuote;
  const fig = figureBlock(spine, section);
  const chTag = `${chapter.id.replace("C", "")} · ${escapeHtml(chapter.title)}`;
  const bodyRest = rest.map((p, i) => {
    let html = `<p>${clean(p.text)}</p>`;
    if (pull && i === 0 && rest.length > 1) html += `<blockquote class="pull">${clean(pull)}</blockquote>`;
    return html;
  }).join("\n");
  return `
  <section class="secblock">
    <div class="sec-head">
      <div class="sec-kicker">${chTag}</div>
      <h2 class="sec-title">${clean(section.title)}</h2>
      <p class="standfirst">${clean(section.thesis)}</p>
    </div>
    <div class="body">
      ${lead ? `<p class="lead">${clean(lead.text)}</p>` : ""}
      ${fig}
      ${bodyRest}
      ${pull && rest.length <= 1 ? `<blockquote class="pull">${clean(pull)}</blockquote>` : ""}
    </div>
  </section>`;
}

function chapterDivider(chapter, n) {
  return `
  <section class="sheet divider">
    <div class="div-num">${String(n).padStart(2, "0")}</div>
    <h1 class="div-title">${clean(chapter.title)}</h1>
    <p class="div-sum">${clean(chapter.summary || "")}</p>
    <div class="div-rule"></div>
  </section>`;
}

function coverPage(spine) {
  const m = spine.meta;
  return `
  <section class="sheet cover">
    <div class="cover-top"><span class="brand"><span class="dot"></span>${escapeHtml(m.brand)}</span><span class="cover-tag">A PLAYBOOK</span></div>
    <div class="cover-mid"><h1 class="cover-title">${clean(m.topic)}</h1>${m.subtitle ? `<p class="cover-sub">${clean(m.subtitle)}</p>` : ""}</div>
    <div class="cover-bot"><p class="cover-thesis">${clean(spine.thesis)}</p><span class="cover-aud">For ${escapeHtml(m.audience)}</span></div>
  </section>`;
}

function contentsPage(spine) {
  let rows = "";
  spine.outline.chapters.forEach((c, i) => {
    rows += `<div class="toc-ch"><span class="toc-n">${String(i + 1).padStart(2, "0")}</span><span class="toc-t">${clean(c.title)}</span></div>`;
    for (const s of c.sections) rows += `<div class="toc-sec">${clean(s.title)}</div>`;
  });
  return `<section class="sheet toc"><h2 class="page-h">Contents</h2><div class="toc-list">${rows}</div></section>`;
}

function conceptPage(spine, accent) {
  const parts = spine.outline.chapters.map((c) => shortLabel(c.title, 2)).slice(0, 6);
  if (parts.length < 3) return "";
  const svg = diagramPrim({ title: "The Map", core: shortLabel(spine.meta.topic, 2), parts }, accent);
  return `<section class="sheet concept"><h2 class="page-h">How this book connects</h2><div class="concept-wrap">${svg}</div></section>`;
}

function sourcesPage(spine) {
  const rows = (spine.evidence || []).map((e) => `<li><span class="src-id">${e.id}</span> ${clean(e.claim)} <a href="${escapeHtml(e.url)}">${escapeHtml(e.source || "source")}</a></li>`).join("\n");
  return `<section class="sheet sources"><h2 class="page-h">Evidence &amp; Sources</h2><p class="src-note">Every hard claim in this playbook traces to one of these sources.</p><ol class="src-list">${rows}</ol></section>`;
}

function css(accent) {
  return `
  :root{--paper:#ffffff;--ink:#15191f;--muted:#6b7280;--hair:#e7e3da;--accent:${accent};--card:#f7f5f0;}
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--paper);font-size:11pt}
  h1,h2,.cover-title,.div-title{font-family:'Playfair Display',Georgia,serif}
  /* full-page "sheets" (front matter + dividers) — each starts AND ends on its own page. break-before is
     essential: a divider following a flowing section must start fresh, else its min-height spills a blank page. */
  .sheet{min-height:250mm;break-before:page;break-after:page;page-break-before:always;page-break-after:always;display:flex;flex-direction:column}
  .cover{justify-content:space-between}
  .cover::before{content:"";position:relative;display:block;height:5px;background:var(--accent);margin:-2mm 0 0}
  .cover-top{display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:2px;font-size:11pt;margin-top:6mm}
  .brand{display:flex;align-items:center;gap:8px}.dot{width:12px;height:12px;background:var(--accent);border-radius:3px;display:inline-block}
  .cover-tag{font-family:'IBM Plex Mono',monospace;color:var(--muted);font-weight:600;font-size:9.5pt}
  .cover-title{font-size:52pt;font-weight:800;line-height:1.02;letter-spacing:-1px;max-width:16ch}
  .cover-sub{font-weight:500;font-size:17pt;color:var(--muted);margin-top:14px;max-width:34ch}
  .cover-thesis{font-family:'Playfair Display';font-style:italic;font-size:15pt;line-height:1.45;max-width:52ch;border-left:3px solid var(--accent);padding-left:18px}
  .cover-aud{display:block;margin-top:18px;font-family:'IBM Plex Mono',monospace;font-size:9.5pt;color:var(--muted);letter-spacing:1px}
  .page-h{font-size:30pt;font-weight:700;margin-bottom:20px;border-bottom:2px solid var(--ink);padding-bottom:10px}
  .toc-ch{display:flex;gap:14px;align-items:baseline;margin-top:18px}
  .toc-n{font-family:'IBM Plex Mono',monospace;color:var(--accent);font-weight:700;font-size:13pt}
  .toc-t{font-family:'Playfair Display';font-weight:700;font-size:16pt}
  .toc-sec{margin-left:40px;color:var(--muted);font-size:11pt;margin-top:6px}
  .concept-wrap{margin-top:16px}
  /* divider — bold editorial, big accent numeral (no full-bleed needed) */
  .divider{justify-content:center}
  .div-num{font-family:'Playfair Display';font-weight:800;font-size:120pt;line-height:0.9;color:var(--accent);opacity:0.18}
  .div-title{font-size:40pt;font-weight:800;line-height:1.06;margin-top:-14px;max-width:20ch}
  .div-sum{font-size:13.5pt;color:var(--muted);margin-top:16px;max-width:48ch;line-height:1.55}
  .div-rule{height:4px;width:90px;background:var(--accent);margin-top:24px}
  /* sections — FLOW continuously; a section never forces its own page (no orphan pages) */
  .secblock{padding-top:11mm;break-inside:auto}
  .sec-head{break-after:avoid;page-break-after:avoid}
  .sec-kicker{font-family:'IBM Plex Mono',monospace;font-size:9pt;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-weight:600}
  .sec-title{font-size:26pt;font-weight:700;line-height:1.1;margin-top:8px;letter-spacing:-0.5px}
  .standfirst{font-family:'Playfair Display';font-style:italic;font-size:14.5pt;color:var(--muted);margin-top:12px;line-height:1.45;max-width:58ch}
  .body{margin-top:14px;font-size:11pt;line-height:1.6;color:#232a33}
  .body p{margin-top:11px;text-align:justify;orphans:2;widows:2}
  .body p.lead:first-letter{font-family:'Playfair Display';float:left;font-size:50pt;line-height:0.82;padding:5px 10px 0 0;color:var(--accent);font-weight:800}
  .fig{margin:18px 0;padding:16px;background:var(--card);border:1px solid var(--hair);border-radius:8px;break-inside:avoid;page-break-inside:avoid;text-align:center}
  .svgwrap{width:100%}
  .fig .svgwrap svg{max-height:150mm !important;width:auto !important;max-width:100%;margin:0 auto}
  .figimg{max-height:150mm;width:auto;max-width:100%;height:auto;border-radius:6px;display:block;margin:0 auto}
  figcaption{margin-top:10px;font-size:9pt;color:var(--muted)}
  .fignum{font-family:'IBM Plex Mono',monospace;color:var(--accent);font-weight:700}
  .pull{margin:20px 0;padding:4px 0 4px 22px;border-left:4px solid var(--accent);font-family:'Playfair Display';font-size:17pt;line-height:1.34;color:var(--ink);font-weight:600;break-inside:avoid}
  .src-note{color:var(--muted);margin-bottom:14px}
  .src-list{padding-left:0;list-style:none}
  .src-list li{font-size:10pt;line-height:1.5;margin-bottom:9px;color:#333;padding-left:44px;position:relative;break-inside:avoid}
  .src-id{position:absolute;left:0;font-family:'IBM Plex Mono',monospace;color:var(--accent);font-weight:700}
  .src-list a{color:var(--accent);text-decoration:none}
  `;
}

function main() {
  const p = runPaths(ID);
  const spine = loadSpine(ID);
  const accent = spine.meta.accent || "#4f8cff";
  log(`LAYOUT id=${ID}`);

  const parts = [coverPage(spine), contentsPage(spine), conceptPage(spine, accent)];
  spine.outline.chapters.forEach((c, i) => {
    parts.push(chapterDivider(c, i + 1));
    for (const s of c.sections) parts.push(sectionBlock(spine, c, s));
  });
  parts.push(sourcesPage(spine));

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>${escapeHtml(spine.meta.topic)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,600&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css(accent)}</style></head><body>${parts.join("\n")}</body></html>`;

  fs.writeFileSync(p.html, html);
  spine.stages.layout = true;
  saveSpine(ID, spine);
  log(`  ${parts.length} blocks (flowing) -> ${p.html}`);
}
main();
