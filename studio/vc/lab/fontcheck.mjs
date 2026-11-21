// Builds lab/fontcheck.html: our font engine's widths vs the browser's real layout (same TTF files).
// Serve studio/vc (launch config "cue-lab") and open /lab/fontcheck.html; window.result holds the errors.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadFont } from "../font.mjs";

const FONTS = { "SpaceGrotesk-700": ["Space Grotesk", 700], "InterTight-500": ["Inter Tight", 500], "InterTight-800": ["Inter Tight", 800], "Unbounded-900": ["Unbounded", 900] };
const SAMPLES = ["AVATAR Today Wave", "Kya aap ke campus par founders aur leaders ban rahe hain?", "70%",
  "Entrepreneurship training, taake aap real startups build karna seekhen.", "LT To Wa Yo P. F, office efficient"];
const cases = [];
for (const [f, [fam, w]] of Object.entries(FONTS)) {
  const F = loadFont(fileURLToPath(new URL(`../fonts/${f}.ttf`, import.meta.url)));
  for (const s of SAMPLES) for (const tr of [0, 0.05]) cases.push({ f, fam, w, s, tr, ours: F.measure(s, 100, tr) });
}
const css = Object.entries(FONTS).map(([f, [fam, w]]) => `@font-face{font-family:'${fam}';font-weight:${w};src:url(../fonts/${f}.ttf)}`).join("\n");
const script = `
const cases = ${JSON.stringify(cases)};
Promise.all(cases.map((c) => document.fonts.load(c.w + " 100px '" + c.fam + "'"))).then(() => {
  window.result = cases.map((c) => {
    const e = document.createElement("span");
    e.style.cssText = "font-size:100px;white-space:pre;position:absolute;top:0;left:0;font-family:'" + c.fam + "';font-weight:" + c.w + ";letter-spacing:" + c.tr + "em";
    e.textContent = c.s;
    document.body.appendChild(e);
    const b = e.getBoundingClientRect().width;
    e.remove();
    return { f: c.f, s: c.s.slice(0, 18), tr: c.tr, ours: +c.ours.toFixed(2), browser: +b.toFixed(2), err: +(c.ours - b).toFixed(2) };
  });
});`;
writeFileSync(new URL("./fontcheck.html", import.meta.url), `<!doctype html><meta charset=utf-8><style>${css}</style><body><script>${script}</script>`);
console.log(`fontcheck.html: ${cases.length} cases`);
