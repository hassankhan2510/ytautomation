/**
 * PHASE 7 — RENDER (headless Chromium -> vector PDF).
 *
 * Loads runs/<id>/book.html in a real browser (so Google Fonts + inline SVG render exactly), then prints
 * an A4 PDF with SELECTABLE TEXT and razor-sharp VECTOR graphics (the SVGs stay vectors — no rasterising),
 * plus real page numbers in the footer. This is the "$500 textbook" output.
 *
 *   PB_ID=gnn node src/pb_render.mjs
 * Env: PUPPETEER_EXECUTABLE_PATH to use a system Chrome instead of the bundled one.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { loadSpine, saveSpine, runPaths, log, arg } from "./pb_util.mjs";

const ID = arg("id", process.env.PB_ID || "");
if (!ID) { console.error("Set PB_ID."); process.exit(1); }

// Find a usable Chromium: env override -> puppeteer's own -> a system Chrome/Edge (so it works locally
// even when the bundled download was blocked). On CI, `npm install` fetches Chromium and this is skipped.
function resolveBrowser(puppeteer) {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch { /* not downloaded */ }
  const home = process.env.LOCALAPPDATA || process.env.HOME || "";
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${home}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium",
  ];
  return candidates.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || null;
}

async function main() {
  const p = runPaths(ID);
  if (!fs.existsSync(p.html)) { console.error("No book.html — run layout first."); process.exit(1); }
  const spine = loadSpine(ID);
  log(`RENDER id=${ID}`);

  let puppeteer;
  try { puppeteer = (await import("puppeteer")).default; }
  catch { console.error("puppeteer not installed. Run `npm install` inside playbook/."); process.exit(1); }

  const launch = { headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"] };
  const exe = resolveBrowser(puppeteer);
  if (exe) { launch.executablePath = exe; log(`  browser: ${exe}`); }
  else log("  browser: puppeteer default (bundled Chromium)");

  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(p.html).href, { waitUntil: "networkidle0", timeout: 90000 });
    // give web fonts a beat to settle so text metrics are final
    await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
    await new Promise((r) => setTimeout(r, 600));

    const brand = (spine.meta.brand || "").replace(/</g, "");
    const footer = `<div style="width:100%;font-family:Inter,sans-serif;font-size:8px;color:#9aa1ab;padding:0 18mm;display:flex;justify-content:space-between;">
      <span>${brand}</span><span class="pageNumber"></span></div>`;
    // Uniform margins on EVERY page -> flowing section text is always correctly margined, never full-bleed.
    // Return the buffer (no `path`) and write it ourselves — passing `path` streams via DevTools IO, which
    // intermittently throws "Protocol error (IO.read): Read failed" on some Chrome builds.
    const buf = await page.pdf({
      format: "A4", printBackground: true,
      displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footer,
      margin: { top: "16mm", bottom: "16mm", left: "18mm", right: "18mm" }, preferCSSPageSize: false,
    });
    fs.writeFileSync(p.pdf, buf);
    const kb = Math.round(fs.statSync(p.pdf).size / 1024);
    spine.stages.render = true;
    saveSpine(ID, spine);
    log(`  ✓ ${p.pdf} (${kb} KB)`);
  } finally { await browser.close(); }
}
main().catch((e) => { console.error("render failed:", e.message); process.exit(1); });
