"""
Feasibility test: can OmniVoice (k2-fsa, Apache-2.0) clone the creator's voice on a CPU-only
GitHub runner, and how long does it take per second of speech?

  python scripts/omnivoice_cpu_test.py      -> out/voicetest/*.wav + timing report
"""
import inspect
import os
import subprocess
import time

import soundfile as sf
import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out", "voicetest")
os.makedirs(OUT, exist_ok=True)
ref_full = os.path.join(ROOT, "voice", "voice_ref.wav")
ref_clip = os.path.join(OUT, "ref_clip.wav")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "0.5", "-t", "8", "-i", ref_full, ref_clip], check=True)

LINES = {
    "urdu_english": ("ur", "آج ہم AI کے بارے میں بات کریں گے، اور یہ technology سب کچھ change کر دے گی۔"),
    "english": ("en", "Today we're talking about a technology that will change everything. Are you ready?"),
    "urdu_english_long": ("ur", "سوچیں، ایک computer جس کی memory آپ کے phone charger سے بھی کم تھی، اس نے انسانوں کو چاند پر پہنچا دیا۔ یہ کیسے ممکن ہوا؟"),
}

torch.set_num_threads(os.cpu_count() or 4)
t0 = time.time()
from omnivoice import OmniVoice  # noqa: E402

model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cpu", dtype=torch.float32)
load_s = time.time() - t0
params = inspect.signature(model.generate).parameters
lang_arg = next((p for p in ("language", "language_id", "lang") if p in params), None)
print(f"model loaded in {load_s:.1f}s · cpu threads {torch.get_num_threads()} · language arg: {lang_arg}")
print("generate() params:", ", ".join(params))

t1 = time.time()
prompt = model.create_voice_clone_prompt(ref_audio=ref_clip) if hasattr(model, "create_voice_clone_prompt") else None
print(f"voice prompt built in {time.time() - t1:.1f}s")

rows = []
for name, (lang, text) in LINES.items():
    kw = {"text": text}
    kw.update({"voice_clone_prompt": prompt} if prompt is not None else {"ref_audio": ref_clip})
    if lang_arg:
        kw[lang_arg] = lang
    t = time.time()
    audio = model.generate(**kw)
    took = time.time() - t
    dur = len(audio[0]) / 24000
    sf.write(os.path.join(OUT, f"omnivoice_{name}.wav"), audio[0], 24000)
    rows.append((name, dur, took))
    print(f"{name:18s} speech {dur:5.1f}s  took {took:6.1f}s  ->  {took / max(dur, 0.1):5.1f}x realtime")

speech = sum(r[1] for r in rows)
took = sum(r[2] for r in rows)
rt = took / max(speech, 0.1)
report = [
    "### 🎙️ OmniVoice on a CPU runner",
    f"- model load: {load_s:.0f}s · CPU threads: {torch.get_num_threads()} · language argument: `{lang_arg}`",
    *[f"- `{n}`: {d:.1f}s of speech in {t:.0f}s ({t / max(d, 0.1):.1f}× realtime)" for n, d, t in rows],
    f"- **Average: {rt:.1f}× realtime → a 35 s reel narration ≈ {35 * rt / 60:.0f} min on CPU**",
]
print("\n".join(report))
if os.environ.get("GITHUB_STEP_SUMMARY"):
    open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write("\n".join(report) + "\n")
