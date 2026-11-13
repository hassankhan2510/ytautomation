/* Voice-only pronunciation fixes for Urdu reels (the screen keeps "RAM", "1969", ...).
 * An Urdu TTS reads Latin acronyms and digits with Urdu rules ("RAM" -> "Raam", 1969 in Urdu), but the
 * creator wants English words and numbers said in ENGLISH. So, deterministically:
 *   - word-acronyms (RAM, NASA, ...) -> Urdu-script phonetic spelling of the English word
 *   - other ALL-CAPS acronyms (AI, CPU, KB) -> English letter names in Urdu script ("اے آئی")
 *   - numbers -> English words ("1969" -> "nineteen sixty nine", "2.3" -> "two point three") */
const LETTER = { A: "اے", B: "بی", C: "سی", D: "ڈی", E: "ای", F: "ایف", G: "جی", H: "ایچ", I: "آئی", J: "جے", K: "کے", L: "ایل", M: "ایم", N: "این", O: "او", P: "پی", Q: "کیو", R: "آر", S: "ایس", T: "ٹی", U: "یو", V: "وی", W: "ڈبلیو", X: "ایکس", Y: "وائی", Z: "زیڈ" };
const WORD_ACRONYMS = { RAM: "ریم", ROM: "روم", NASA: "ناسا", LASER: "لیزر", RADAR: "ریڈار", SONAR: "سونار", NATO: "نیٹو", UNESCO: "یونیسکو", UNICEF: "یونیسیف", COVID: "کووڈ", SCUBA: "سکوبا", GIF: "گِف", JPEG: "جے پیگ", WIFI: "وائی فائی", NAV: "نیو" };
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const under100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const under1000 = (n) => (n < 100 ? under100(n) : ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + under100(n % 100) : ""));
export function numberWords(raw) {
  const s = String(raw).replace(/,/g, "");
  if (/^\d+\.\d+$/.test(s)) { const [a, b] = s.split("."); return `${numberWords(a)} point ${b.split("").map((d) => ONES[+d]).join(" ")}`; }
  const n = Number(s);
  if (!Number.isFinite(n) || n > 999_999_999) return raw;
  if (n >= 1100 && n <= 2099 && n % 100 !== 0 && /^\d{4}$/.test(s)) return `${under100(Math.floor(n / 100))} ${n % 100 < 10 ? "oh " + ONES[n % 100] : under100(n % 100)}`; // years: 1969 -> nineteen sixty nine
  const parts = [];
  if (n >= 1_000_000) parts.push(`${under1000(Math.floor(n / 1_000_000))} million`);
  if (n % 1_000_000 >= 1000) parts.push(`${under1000(Math.floor((n % 1_000_000) / 1000))} thousand`);
  if (n % 1000 || !parts.length) parts.push(under1000(n % 1000));
  return parts.join(" ");
}
const yearWords = (y) => {
  const n = Number(y);
  if (n < 1000) return under1000(n); // 776 BC -> seven hundred seventy six BC
  return n % 100 === 0 ? `${under100(Math.floor(n / 100))} hundred` : `${under100(Math.floor(n / 100))} ${n % 100 < 10 ? "oh " + ONES[n % 100] : under100(n % 100)}`;
};
export function speakFix(text) {
  return String(text)
    .replace(/(\d)([A-Za-z]{1,4})\b/g, "$1 $2") // 4KB -> 4 KB, 5G -> 5 G
    .replace(/\b(\d{3,4})(\s*)(BCE|BC|CE|AD)\b/g, (_, y, sp, era) => `${yearWords(y)}${sp}${era}`) // 2560 BC -> twenty five sixty BC
    .replace(/\b(\d[\d,]*(?:\.\d+)?)\b/g, (m) => numberWords(m))
    .replace(/\b[A-Z][A-Z0-9]{1,6}\b/g, (m) => WORD_ACRONYMS[m] || (/^[A-Z]+$/.test(m) ? m.split("").map((c) => LETTER[c]).join(" ") : m));
}
