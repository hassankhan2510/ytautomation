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
        for (let n = 1; n < e.itemTimes.length; n++) e.itemTimes[n] = Math.max(e.itemTimes[n], e.itemTimes[n - 1] + 0.3);
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
  // 5. READING TIME (hard rule, subtitle standard): every text must stay up long enough to read —
  //    chars / CPS (+0.3 s to find it), at least 5/6 s; words the voice is saying count half.
  //    Fix order: (a) appear up to 0.35 s BEFORE its word, (b) a hold of at most 0.3 s at the cut (the
  //    compiler owns the audio timeline: plan.audio splices the voice around holds), (c) report it.
  const CPS = opts.cps ?? 17, EXIT = 0.22, PREROLL = 0.35, MAXHOLD = opts.maxHold ?? 0.3;
  const audio = [];
  let offset = 0, srcCursor = 0;
  out.forEach((sc, i) => {
    const shift = (x) => x + offset;
    if (offset) {
      sc.end = shift(sc.end); sc.speech = sc.speech.map(shift);
      sc.words = sc.words.map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) }));
      for (const e of sc.elements) { e.t = shift(e.t); if (e.itemTimes) e.itemTimes = e.itemTimes.map(shift); if (e.pulse != null) e.pulse = shift(e.pulse); }
    }
    if (i) sc.start = out[i - 1].end;                       // a scene starts where the previous one ends (holds included)
    const spoken = new Set(sc.words.map((w) => norm(w.w)));
    const need = (txt) => {
      let chars = 0;
      for (const w of String(txt).split(/\s+/).filter(Boolean)) chars += (spoken.has(norm(w)) ? 0.5 : 1) * (w.length + 1);
      return Math.max(5 / 6, chars / CPS + 0.3);
    };
    let deficit = 0;
    const fit = (t, txt, anchored) => {
      const n = need(txt), latestStart = sc.end - EXIT - n;
      if (t <= latestStart) return t;
      const earliest = anchored ? Math.max(sc.start, t - PREROLL) : sc.start;
      const t2 = Math.max(earliest, latestStart);
      deficit = Math.max(deficit, t2 - latestStart);
      return t2;
    };
    for (const e of sc.elements) {
      const txt = [e.text, e.label, e.by].filter(Boolean).join(" ");
      if (e.itemTimes) { e.itemTimes = e.itemTimes.map((t, n) => fit(t, e.items[n], true)); e.t = e.itemTimes[0]; }
      else e.t = fit(e.t, txt, e.anchored);
    }
    const hold = Math.min(MAXHOLD, deficit);
    if (deficit > MAXHOLD + 1e-6) diagnostics.push(`scene ${sc.id}: text is too fast to read (${deficit.toFixed(2)} s short even after appearing early + a ${MAXHOLD} s hold) — shorten the on-screen text or say more`);
    // audio: the voice plays straight through this scene, then pauses `hold` at the cut
    const srcEnd = sc.end - offset;
    audio.push({ from: +srcCursor.toFixed(3), to: +srcEnd.toFixed(3), at: +(srcCursor + offset).toFixed(3) });
    srcCursor = srcEnd;
    if (hold > 0.005) { sc.end += hold; sc.hold = +hold.toFixed(3); offset += hold; }
  });
  const duration = out.length ? out[out.length - 1].end : 0;
  return { scenes: out, duration, audio, holds: out.filter((s) => s.hold).map((s) => ({ scene: s.id, dur: s.hold })), diagnostics };
}
