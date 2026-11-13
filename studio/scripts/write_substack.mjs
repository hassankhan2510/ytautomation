// STUDIO — WRITE FOR SUBSTACK: raw paragraph → (1) a full article built for Google + AI answer engines
// (AEO) and (2) a Substack Note signed with the author bio. Every piece carries the SAME identity text
// from brand/author.json, so search/AI engines learn one consistent "Hassan Khan".
//
//   PARAGRAPH="..." node scripts/write_substack.mjs        → out/article.md, out/article.html, out/note.txt
//
// Facts: only from the paragraph (+ the author bio). A fact-check pass removes unsupported paragraphs.
// Substack has no article API, so the article is delivered for a 2-minute paste; the Note can be
// auto-posted through Buffer (Substack Notes are officially supported there).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groqJSON } from "../../theranos-doc/scripts/lib_groq.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paragraph = (process.env.PARAGRAPH || "").trim();
if (paragraph.length < 30) throw new Error("PARAGRAPH is empty/too short.");
const author = JSON.parse(fs.readFileSync(path.join(ROOT, "brand/author.json"), "utf8"));
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const esc = (s) => clean(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ── 1. Write ── */
const system = `You write for ${author.name}'s Substack. Voice: clear, warm, smart friend explaining a hard topic in simple words — no jargon without a one-line explanation, short paragraphs, concrete examples.
Return ONLY JSON:
{"title":"specific, curiosity-driven, max 70 chars",
 "subtitle":"one line, max 120 chars",
 "tldr":"2-3 sentence plain-language summary that directly answers the main question (this is what AI answer engines quote)",
 "takeaways":["3-5 one-line key points"],
 "sections":[{"heading":"question-style or clear heading","paragraphs":["2-4 sentences each"]}],
 "faq":[{"q":"a question real people would search","a":"a direct 1-3 sentence answer"}],
 "note":"a Substack Note: a scroll-stopping first line, 2-4 short lines with the most interesting insight, and a question to the reader. Max 600 characters. Plain text, no hashtags, no emojis."}
RULES: 3-5 sections; 3-4 FAQ items. Every fact (number, date, name, place, cause, claim) must come from the SOURCE — do NOT add outside knowledge, even true facts, and never invent studies, quotes or sources. If the source is thin, go deeper on explanation and implications, not new facts.
Do not mention the author inside the article body (the author box is added automatically).`;
console.log("① WRITE…");
const a = await groqJSON(system, `SOURCE:\n"""${paragraph.slice(0, 8000)}"""`, { maxTokens: 4500, temperature: 0.6 });
if (!a?.title || !Array.isArray(a.sections)) throw new Error("Writer returned no article.");

/* ── 2. Fact-check every paragraph / answer ── */
const units = [];
(a.sections || []).forEach((s, si) => (s.paragraphs || []).forEach((p, pi) => units.push({ kind: "p", si, pi, text: clean(p) })));
(a.faq || []).forEach((f, fi) => units.push({ kind: "faq", fi, text: `${clean(f.q)} ${clean(f.a)}` }));
units.push({ kind: "tldr", text: clean(a.tldr) });
(a.takeaways || []).forEach((t, ti) => units.push({ kind: "tk", ti, text: clean(t) }));
console.log("② FACT-CHECK…");
const chk = await groqJSON(
  `You are a strict FACT-CHECKER. For each numbered ITEM, flag it if it states any fact (number, date, name, place, cause, superlative, claim) NOT supported by the SOURCE — even if true in the real world. Explanations, analogies and opinions without new facts are fine.
Return ONLY JSON: {"bad":[{"i":item number,"why":"max 8 words"}]}`,
  `SOURCE:\n"""${paragraph.slice(0, 8000)}"""\n\nITEMS:\n${units.map((u, k) => `${k + 1}. ${u.text}`).join("\n")}`,
  { maxTokens: 1500, temperature: 0.1 },
);
const removed = [];
for (const b of chk?.bad || []) {
  const u = units[Number(b?.i) - 1];
  if (!u) continue;
  removed.push(`${u.text.slice(0, 90)}… (${clean(b.why)})`);
  if (u.kind === "p") a.sections[u.si].paragraphs[u.pi] = null;
  if (u.kind === "faq") a.faq[u.fi] = null;
  if (u.kind === "tk") a.takeaways[u.ti] = null;
  if (u.kind === "tldr") a.tldr = "";
}
a.sections = a.sections.map((s) => ({ ...s, paragraphs: (s.paragraphs || []).filter(Boolean) })).filter((s) => s.paragraphs.length);
a.faq = (a.faq || []).filter(Boolean);
a.takeaways = (a.takeaways || []).filter(Boolean);

/* ── 3. Author box (identical everywhere) ── */
const links = Object.entries(author.links || {}).filter(([, v]) => v);
const authorMd = [`---`, `**About the author**`, ``, author.long, ...(links.length ? [``, links.map(([k, v]) => `[${k}](${v})`).join(" · ")] : [])].join("\n");
const authorHtml = `<hr><p><strong>About the author</strong></p><p>${esc(author.long)}</p>${links.length ? `<p>${links.map(([k, v]) => `<a href="${v}">${esc(k)}</a>`).join(" · ")}</p>` : ""}`;

/* ── 4. Render: Markdown (archive) + HTML (paste into Substack's editor keeps the formatting) ── */
const md = [
  `# ${clean(a.title)}`,
  `*${clean(a.subtitle)}*`,
  "",
  ...(a.tldr ? [`**TL;DR —** ${clean(a.tldr)}`, ""] : []),
  ...(a.takeaways.length ? ["**Key takeaways**", ...a.takeaways.map((t) => `- ${clean(t)}`), ""] : []),
  ...a.sections.flatMap((s) => [`## ${clean(s.heading)}`, ...s.paragraphs.map(clean), ""]),
  ...(a.faq.length ? ["## FAQ", ...a.faq.flatMap((f) => [`**${clean(f.q)}**`, clean(f.a), ""])] : []),
  authorMd,
].join("\n");
const html = [
  `<h1>${esc(a.title)}</h1>`,
  `<h3>${esc(a.subtitle)}</h3>`,
  a.tldr ? `<p><strong>TL;DR — </strong>${esc(a.tldr)}</p>` : "",
  a.takeaways.length ? `<p><strong>Key takeaways</strong></p><ul>${a.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "",
  ...a.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}`),
  a.faq.length ? `<h2>FAQ</h2>${a.faq.map((f) => `<p><strong>${esc(f.q)}</strong></p><p>${esc(f.a)}</p>`).join("")}` : "",
  authorHtml,
].filter(Boolean).join("\n");
const link = author.links?.substack || author.links?.website || "";
const note = [clean(a.note).replace(/\s*(#\w+\s*)+$/g, ""), "", author.signature, ...(link ? [link] : [])].join("\n").trim();

fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "out/article.md"), md + "\n");
fs.writeFileSync(path.join(ROOT, "out/article.html"), `<!doctype html><meta charset="utf-8"><title>${esc(a.title)}</title>\n<article>\n${html}\n</article>\n`);
fs.writeFileSync(path.join(ROOT, "out/note.txt"), note + "\n");

const report = [
  `### 📰 ${clean(a.title)}`,
  `_${clean(a.subtitle)}_`,
  "",
  `${a.sections.length} sections · ${a.faq.length} FAQ · ${md.split(/\s+/).length} words · author box ✓`,
  removed.length ? `🔍 Fact-check removed ${removed.length} unsupported item(s):\n${removed.map((r) => `  - ${r}`).join("\n")}` : "🔍 Fact-check: every paragraph is supported by your notes.",
  "",
  "**Substack Note**",
  "```",
  note,
  "```",
  "",
  "**To publish the article:** download the artifact → open `article.html` in a browser → select all → copy → paste into a new Substack post (formatting is kept).",
];
console.log(report.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.join("\n") + "\n");
