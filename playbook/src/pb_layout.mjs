/**
 * PHASE 6 — LAYOUT (the algorithmic "Vogue" engine).
 *
 * Assembles the Spine into one print-ready HTML document with an editorial design system: A4 pages,
 * Playfair Display + Inter + IBM Plex Mono, a strict type scale, generous margins, drop caps, framed
 * full-width figures with source lines, and pull-quote breaks. Each section gets a master template chosen
 * by its content. The result is rendered to a vector PDF in the next phase.
 *
 *   PB_ID=gnn node src/pb_layout.mjs   ->  runs/<id>/book.html
 */
import fs from "node:fs";
import { allSections, evidenceMap } from "./pb_schema.mjs";
import { diagram as diagramPrim } from "./pb_graphics_lib.mjs";
import { loadSpine, saveSpine, runPaths, escapeHtml, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

function figureBlock(spine, section) {
  const g = spine.graphics?.[section.id];
  if (!g) return "";
  const inner = g.svg
    ? `<div class="svgwrap">${g.svg}</div>`
    : g.imagePath ? `<img class="figimg" src="${escapeHtml(g.imagePath)}" alt="${escapeHtml(g.caption || "")}"/>` : "";
  if (!inner) return "";
  const srcIds = section.visual?.evidenceIds || section.evidenceIds || [];
  const emap = evidenceMap(spine);
  const srcs = [...new Set(srcIds.map((id) => emap.get(id)?.source).filter(Boolean))];
  const cap = g.caption ? `<figcaption><span class="fignum">Fig.</span> ${escapeHtml(g.caption)}${srcs.length ? ` — <span class="figsrc">${escapeHtml(srcs.join(", "))}</span>` : ""}</figcaption>` : "";
  return `<figure class="fig">${inner}${cap}</figure>`;
}

function sectionPage(spine, chapter, section, idx) {
  const paras = section.content?.paragraphs || [];
  const lead = paras[0];
  const rest = paras.slice(1);
  const pull = section.content?.pullQuote;
  const fig = figureBlock(spine, section);
  const chTag = `${chapter.id.replace("C", "")} · ${escapeHtml(chapter.title)}`;
  // template: image/full figures go above the fold; otherwise figure sits after the lead paragraph.
  const bodyRest = rest.map((p, i) => {
    let html = `<p>${escapeHtml(p.text)}</p>`;
    if (pull && i === 0 && rest.length > 1) html += `<blockquote class="pull">${escapeHtml(pull)}</blockquote>`;
    return html;
  }).join("\n");
  return `
  <section class="page section">
    <div class="sec-kicker">${chTag}</div>
    <h2 class="sec-title">${escapeHtml(section.title)}</h2>
    <p class="standfirst">${escapeHtml(section.thesis)}</p>
    <div class="body">
      ${lead ? `<p class="lead">${escapeHtml(lead.text)}</p>` : ""}
      ${fig}
      ${bodyRest}
      ${pull && rest.length <= 1 ? `<blockquote class="pull">${escapeHtml(pull)}</blockquote>` : ""}
    </div>
  </section>`;
}

function chapterDivider(chapter, n) {
  return `
  <section class="page divider">
    <div class="div-num">${String(n).padStart(2, "0")}</div>
    <h1 class="div-title">${escapeHtml(chapter.title)}</h1>
    <p class="div-sum">${escapeHtml(chapter.summary || "")}</p>
  </section>`;
}

function coverPage(spine) {
  const m = spine.meta;
  return `
  <section class="page cover">
    <div class="cover-top">
      <span class="brand"><span class="dot"></span>${escapeHtml(m.brand)}</span>
      <span class="cover-tag">A PLAYBOOK</span>
    </div>
    <div class="cover-mid">
      <h1 class="cover-title">${escapeHtml(m.topic)}</h1>
      ${m.subtitle ? `<p class="cover-sub">${escapeHtml(m.subtitle)}</p>` : ""}
    </div>
    <div class="cover-bot">
      <p class="cover-thesis">${escapeHtml(spine.thesis)}</p>
      <span class="cover-aud">For ${escapeHtml(m.audience)}</span>
    </div>
  </section>`;
}

function contentsPage(spine) {
  let rows = "";
  spine.outline.chapters.forEach((c, i) => {
    rows += `<div class="toc-ch"><span class="toc-n">${String(i + 1).padStart(2, "0")}</span><span class="toc-t">${escapeHtml(c.title)}</span></div>`;
    for (const s of c.sections) rows += `<div class="toc-sec">${escapeHtml(s.title)}</div>`;
  });
  return `<section class="page toc"><h2 class="page-h">Contents</h2><div class="toc-list">${rows}</div></section>`;
}

function conceptPage(spine, accent) {
  const parts = spine.outline.chapters.map((c) => c.title.split(/[:—-]/)[0].trim().split(/\s+/).slice(0, 3).join(" ")).slice(0, 6);
  if (parts.length < 3) return "";
  const svg = diagramPrim({ title: "The Map", core: spine.meta.topic.split(/[:—-]/)[0].trim().split(/\s+/).slice(0, 3).join(" "), parts }, accent);
  return `<section class="page concept"><h2 class="page-h">How this book connects</h2><div class="concept-wrap">${svg}</div></section>`;
}

function sourcesPage(spine) {
  const rows = (spine.evidence || []).map((e) => `<li><span class="src-id">${e.id}</span> ${escapeHtml(e.claim)} <a href="${escapeHtml(e.url)}">${escapeHtml(e.source || "source")}</a></li>`).join("\n");
  return `<section class="page sources"><h2 class="page-h">Evidence &amp; Sources</h2><p class="src-note">Every hard claim in this playbook traces to one of these sources.</p><ol class="src-list">${rows}</ol></section>`;
}

function css(accent) {
  return `
  :root{--paper:#ffffff;--ink:#14181f;--muted:#6b7280;--hair:#e6e3dc;--accent:${accent};--cream:#faf8f4;}
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--paper)}
  /* min-height leaves room for the 14mm footer margin reserved by the PDF renderer, so one section = one sheet */
  .page{width:210mm;min-height:250mm;padding:24mm 24mm 8mm;page-break-after:always;position:relative;background:var(--paper);overflow:hidden}
  .page:last-child{page-break-after:auto}
  h1,h2,.cover-title,.div-title{font-family:'Playfair Display',Georgia,serif}
  /* cover */
  .cover{display:flex;flex-direction:column;justify-content:space-between;background:var(--cream);border-top:6px solid var(--accent)}
  .cover-top{display:flex;justify-content:space-between;align-items:center;font-family:'Inter';font-weight:800;letter-spacing:2px;font-size:12pt}
  .brand{display:flex;align-items:center;gap:8px}.dot{width:12px;height:12px;background:var(--accent);border-radius:3px;display:inline-block}
  .cover-tag{font-family:'IBM Plex Mono',monospace;color:var(--muted);font-weight:600;font-size:10pt}
  .cover-title{font-size:52pt;font-weight:800;line-height:1.02;letter-spacing:-1px;max-width:16ch}
  .cover-sub{font-family:'Inter';font-weight:500;font-size:17pt;color:var(--muted);margin-top:14px;max-width:34ch}
  .cover-thesis{font-family:'Playfair Display';font-style:italic;font-size:15pt;line-height:1.45;color:var(--ink);max-width:52ch;border-left:3px solid var(--accent);padding-left:18px}
  .cover-aud{display:block;margin-top:20px;font-family:'IBM Plex Mono',monospace;font-size:10pt;color:var(--muted);letter-spacing:1px}
  /* contents */
  .page-h{font-size:30pt;font-weight:700;margin-bottom:22px;border-bottom:2px solid var(--ink);padding-bottom:10px}
  .toc-ch{display:flex;gap:14px;align-items:baseline;margin-top:20px}
  .toc-n{font-family:'IBM Plex Mono',monospace;color:var(--accent);font-weight:700;font-size:13pt}
  .toc-t{font-family:'Playfair Display';font-weight:700;font-size:16pt}
  .toc-sec{margin-left:40px;color:var(--muted);font-size:11.5pt;margin-top:6px}
  /* concept */
  .concept-wrap{margin-top:20px}
  /* divider */
  .divider{display:flex;flex-direction:column;justify-content:center;background:var(--ink);color:var(--cream)}
  .div-num{font-family:'IBM Plex Mono',monospace;color:var(--accent);font-size:20pt;font-weight:700;letter-spacing:3px}
  .div-title{font-size:44pt;font-weight:800;line-height:1.05;margin-top:10px;max-width:18ch}
  .div-sum{font-size:14pt;color:#c9cdd6;margin-top:18px;max-width:46ch;line-height:1.5}
  /* section */
  .sec-kicker{font-family:'IBM Plex Mono',monospace;font-size:9.5pt;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-weight:600}
  .sec-title{font-size:28pt;font-weight:700;line-height:1.08;margin-top:8px;letter-spacing:-0.5px}
  .standfirst{font-family:'Playfair Display';font-style:italic;font-size:15pt;color:var(--muted);margin-top:12px;line-height:1.45;max-width:56ch}
  .body{margin-top:14px;font-size:11pt;line-height:1.55;color:#222831}
  .body p{margin-top:10px;text-align:justify}
  .body p.lead:first-letter{font-family:'Playfair Display';float:left;font-size:50pt;line-height:0.82;padding:4px 10px 0 0;color:var(--accent);font-weight:800}
  .fig{margin:16px 0;padding:14px;background:var(--cream);border:1px solid var(--hair);border-radius:6px;page-break-inside:avoid;text-align:center}
  .svgwrap{width:100%}
  .fig .svgwrap svg{max-height:112mm !important;width:auto !important;max-width:100%;margin:0 auto}
  .figimg{max-height:130mm;width:auto;max-width:100%;height:auto;border-radius:4px;display:block;margin:0 auto}
  figcaption{margin-top:10px;font-size:9.5pt;color:var(--muted);font-family:'Inter'}
  .fignum{font-family:'IBM Plex Mono',monospace;color:var(--accent);font-weight:700}
  .pull{margin:18px 0;padding:6px 0 6px 22px;border-left:4px solid var(--accent);font-family:'Playfair Display';font-size:17pt;line-height:1.32;color:var(--ink);font-weight:600}
  /* sources */
  .src-note{color:var(--muted);margin-bottom:16px}
  .src-list{padding-left:0;list-style:none}
  .src-list li{font-size:10pt;line-height:1.5;margin-bottom:10px;color:#333;padding-left:44px;position:relative}
  .src-id{position:absolute;left:0;font-family:'IBM Plex Mono',monospace;color:var(--accent);font-weight:700}
  .src-list a{color:var(--accent);text-decoration:none}
  `;
}

function main() {
  const p = runPaths(ID);
  const spine = loadSpine(ID);
  const accent = spine.meta.accent || "#4f8cff";
  log(`LAYOUT id=${ID}`);

  const pages = [coverPage(spine), contentsPage(spine), conceptPage(spine, accent)];
  spine.outline.chapters.forEach((c, i) => {
    pages.push(chapterDivider(c, i + 1));
    for (const s of c.sections) pages.push(sectionPage(spine, c, s, i));
  });
  pages.push(sourcesPage(spine));

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>${escapeHtml(spine.meta.topic)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,600&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css(accent)}</style></head><body>${pages.join("\n")}</body></html>`;

  fs.writeFileSync(p.html, html);
  spine.stages.layout = true;
  saveSpine(ID, spine);
  log(`  ${pages.length} pages -> ${p.html}`);
}
main();
