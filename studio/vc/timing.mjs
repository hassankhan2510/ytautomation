// TIME SOLVE: every scene's span comes from the VOICE (word timestamps), cuts snap to music beats only
// where that never cuts a word, and every element lands on the word that names it ("70%" appears as the
// voice says "seventy percent" / "70"). Without timestamps it falls back to a reading-speed estimate.

const norm = (s) => String(s).toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
const NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };

function sameWord(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const da = a.replace(/\D/g, ""), db = b.replace(/\D/g, "");
  if (da && db && da === db) return true;
  if (da && NUMWORDS[b] != null && String(NUMWORDS[b]) === da) return true;
  if (db && NUMWORDS[a] != null && String(NUMWORDS[a]) === db) return true;
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

function estimateWords(prog, wps = 2.9, gap = 0.12) {
  const words = [];
  let t = 0.1;
  for (const s of prog.scenes) {
    for (const w of s.say.split(/\s+/).filter(Boolean)) {
      const d = Math.max(0.16, (norm(w).length + 1.2) / (wps * 5.2));
      words.push({ w, start: t, end: t + d });
      t += d;
    }
    t += gap;
  }
  return words;
}

export function solveTime(prog, opts = {}) {
  const diagnostics = [];
  let words = opts.words && opts.words.length ? opts.words : null;
  const sayCount = prog.scenes.reduce((n, s) => n + s.say.split(/\s+/).filter(Boolean).length, 0);
  if (!words) { words = estimateWords(prog); diagnostics.push("no voice timestamps: timing estimated from reading speed"); }
  else if (words.length < sayCount) { diagnostics.push(`voice has ${words.length} words but the script says ${sayCount}: timing estimated`); words = estimateWords(prog); }
  const beats = (opts.beats || []).slice().sort((a, b) => a - b);

  // 1. each scene owns its run of spoken words (scenes speak in order)
  let k = 0;
  const spans = prog.scenes.map((s) => {
    const n = s.say.split(/\s+/).filter(Boolean).length;
    const own = words.slice(k, k + n);
    k += n;
    return own;
  });

  // 2. cut points: in the silence between two scenes' speech, on a beat if one falls there
  const out = [];
  let prevEnd = 0;
  prog.scenes.forEach((s, i) => {
    const own = spans[i];
    const sStart = own.length ? own[0].start : prevEnd + 0.1;
    const sEnd = own.length ? own[own.length - 1].end : sStart + 2.2;  // silent scene: 2.2 s card
    const next = spans.slice(i + 1).find((x) => x.length);
    let end;
    if (i === prog.scenes.length - 1) end = sEnd + (opts.tail ?? 0.5);
    else {
      const nStart = next ? next[0].start : sEnd + 0.3;
      const lo = sEnd + 0.04, hi = Math.max(lo, nStart - 0.04);
      end = (lo + hi) / 2;
      const b = beats.filter((x) => x >= lo && x <= hi).sort((a, c) => Math.abs(a - end) - Math.abs(c - end))[0];
      if (b != null) end = b;
    }
    out.push({ id: s.id, mood: s.mood, shot: s.shot, start: prevEnd, end, speech: [sStart, sEnd], words: own, elements: [] });
    prevEnd = end;
  });

  // 3. each element lands on the word that names it (just before it is heard)
  prog.scenes.forEach((s, i) => {
    const sc = out[i];
    const lead = 0.08;
    const find = (txt, after = -1) => {
      const parts = String(txt).split(/\s+/).map(norm).filter(Boolean);
      if (!parts.length) return null;
      for (let j = after + 1; j < sc.words.length; j++) if (sameWord(norm(sc.words[j].w), parts[0])) return j;
      return null;
    };
    let auto = 0, lastIdx = -1;
    for (const el of s.elements) {
      const e = { ...el };
      const latest = Math.max(sc.start, sc.end - 0.35);
      const autoT = () => Math.min(latest, sc.start + 0.15 + 0.32 * auto++);
      if (el.role === "list") {
        let after = -1;
        e.itemTimes = el.items.map((it, n) => {
          const j = find(it, after);
          if (j != null) { after = j; return Math.max(sc.start, sc.words[j].start - lead); }
          return Math.min(latest, sc.start + 0.25 + 0.38 * n);
        });
        e.t = e.itemTimes[0];
      } else {
        const j = find(el.at || el.text, el.at ? -1 : lastIdx);
        if (j != null) { e.t = Math.max(sc.start, sc.words[j].start - lead); lastIdx = j; e.anchored = true; }
        else e.t = autoT();
      }
      if (el.emphasis) {
        const j = find(el.emphasis);
        if (j != null) e.pulse = sc.words[j].start;
      }
      sc.elements.push(e);
    }
    // 4. never two entrances closer than 120 ms (the eye reads one thing at a time); keep reading order
    sc.elements.sort((a, b) => a.t - b.t);
    for (let n = 1; n < sc.elements.length; n++) {
      const min = sc.elements[n - 1].t + 0.12;
      if (sc.elements[n].t < min) sc.elements[n].t = Math.min(min, Math.max(sc.start, sc.end - 0.3));
    }
  });
  return { scenes: out, duration: prevEnd, diagnostics };
}
