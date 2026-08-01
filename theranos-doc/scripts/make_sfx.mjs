/**
 * Synthesize the tiny UI sound effects the video uses — as raw PCM WAVs written directly in
 * Node. No ffmpeg, no downloads, license-clean (we generate every sample ourselves).
 *
 *   public/sfx/whoosh.wav  -> soft airy swish on scene / background changes
 *   public/sfx/tick.wav    -> subtle click on stat / number reveals
 *   public/sfx/riser.wav   -> short rising tone under the intro logo
 *
 * Idempotent: skips any file that already exists. Run:  node scripts/make_sfx.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SFX_DIR = path.join(ROOT, "public", "sfx");
const SR = 44100;

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

// A soft filtered-noise swish: a one-pole low-pass whose cutoff opens then closes, with a fast
// attack / slow decay envelope. Subtle — it sits under the narration, not over it.
function whoosh() {
  const dur = 0.42;
  const N = Math.floor(SR * dur);
  const out = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const noise = Math.random() * 2 - 1;
    const sweep = 0.02 + 0.28 * Math.sin((Math.PI * t) / dur); // cutoff opens mid-swish
    lp += sweep * (noise - lp);
    const attack = Math.min(1, t / 0.03);
    const decay = Math.exp(-Math.max(0, t - 0.06) * 7);
    out[i] = lp * attack * decay * 0.5;
  }
  return out;
}

// A crisp high sine click that decays fast -> a "tick" for numbers/stats.
function tick() {
  const dur = 0.06;
  const N = Math.floor(SR * dur);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 55) * 0.4;
  }
  return out;
}

// A rising sine sweep (220 -> ~660 Hz) with a soft envelope, for the intro sting.
function riser() {
  const dur = 0.9;
  const N = Math.floor(SR * dur);
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const freq = 220 * Math.pow(3, t / dur);
    phase += (2 * Math.PI * freq) / SR;
    const env = Math.min(1, t / 0.2) * Math.min(1, (dur - t) / 0.25);
    out[i] = Math.sin(phase) * env * 0.32;
  }
  return out;
}

const FX = { "whoosh.wav": whoosh, "tick.wav": tick, "riser.wav": riser };

fs.mkdirSync(SFX_DIR, { recursive: true });
let made = 0;
for (const [name, gen] of Object.entries(FX)) {
  const out = path.join(SFX_DIR, name);
  if (fs.existsSync(out)) continue;
  writeWav(out, gen());
  made++;
  console.log(`  + public/sfx/${name}`);
}
console.log(made ? `SFX ready (${made} generated).` : "SFX already present.");
