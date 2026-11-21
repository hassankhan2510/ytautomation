// VOICE LOUDNESS per word — drives MOTION amplitude. Reads a WAV (PCM 16/24/32-bit or float32, any
// channels), keeps the speech band (2nd-order high-pass 250 Hz + low-pass 3.8 kHz, RBJ biquads — music
// bass and hats mostly drop out), measures each word's RMS in dB and turns it into a robust z-score
// (median / MAD), so "loud" means loud FOR THIS SPEAKER IN THIS REEL.
import { readFileSync } from "node:fs";

export function readWav(path) {
  const b = readFileSync(path);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4), len = dv.getUint32(o + 4, true);
    if (id === "fmt ") fmt = { tag: dv.getUint16(o + 8, true), ch: dv.getUint16(o + 10, true), sr: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
    if (id === "data") data = { off: o + 8, len: Math.min(len, b.length - o - 8) };
    o += 8 + len + (len & 1);
  }
  if (!fmt || !data) throw new Error(`${path}: not a WAV file`);
  const bytes = fmt.bits / 8, frames = Math.floor(data.len / (bytes * fmt.ch)), out = new Float32Array(frames);
  const isFloat = fmt.tag === 3 || (fmt.tag === 0xfffe && fmt.bits === 32 && false);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const p = data.off + (i * fmt.ch + c) * bytes;
      acc += isFloat ? dv.getFloat32(p, true) : bytes === 2 ? dv.getInt16(p, true) / 32768 : bytes === 3 ? ((dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getInt8(p + 2) << 16)) / 8388608) : dv.getInt32(p, true) / 2147483648;
    }
    out[i] = acc / fmt.ch;
  }
  return { sr: fmt.sr, x: out };
}

function biquad(x, sr, type, f0, q = 0.7071) {
  const w = (2 * Math.PI * f0) / sr, cw = Math.cos(w), a = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === "hp") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; } else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  const a0 = 1 + a, a1 = -2 * cw, a2 = 1 - a;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** z-score of each word's speech-band loudness (null where the word has no audio) */
export function wordLoudness(wavPath, words, offset = 0) {
  const { sr, x } = readWav(wavPath);
  const v = biquad(biquad(x, sr, "hp", 250), sr, "lp", 3800);
  const db = words.map((w) => {
    const a = Math.max(0, Math.round((w.start - offset) * sr)), b = Math.min(v.length, Math.round((w.end - offset) * sr));
    if (b - a < sr * 0.03) return null;
    let s = 0;
    for (let i = a; i < b; i++) s += v[i] * v[i];
    return 10 * Math.log10(s / (b - a) + 1e-12);
  });
  const vals = db.filter((d) => d != null).sort((p, q) => p - q);
  const med = vals[Math.floor(vals.length / 2)] ?? 0;
  const mad = (vals.map((d) => Math.abs(d - med)).sort((p, q) => p - q)[Math.floor(vals.length / 2)] || 1) * 1.4826;
  return db.map((d) => (d == null ? null : +((d - med) / mad).toFixed(2)));
}

/** t -> z of the word being spoken at t (or starting within 0.3 s) */
export function loudnessLookup(words, z) {
  return (t) => {
    for (let i = 0; i < words.length; i++) if (words[i].end >= t - 0.02) return words[i].start <= t + 0.3 ? z[i] : null;
    return null;
  };
}
