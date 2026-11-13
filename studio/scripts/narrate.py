"""
STUDIO — NARRATE: speak every beat of a render-props job and lock the timeline to the real audio.

  python scripts/narrate.py out/props.json            (edits the props in place)

Env: VOICE = mine (Chatterbox clone of voice/voice_ref.wav, default) | kokoro | edge | none

Each beat is synthesized separately, trimmed of dead air, then joined with natural pauses
(longer after a full stop). Because every beat's audio is measured, each scene starts exactly
on its first spoken word; words inside a beat are spread across its speech by length.
Writes public/audio/voice.wav and sets job.audio + job.words (one entry per script token,
in the exact order timeline.ts consumes them).

Chatterbox CPU workarounds are the proven ones from theranos-doc/scripts/gen_voiceover.py.
"""
import asyncio
import json
import os
import re
import sys

import numpy as np
import soundfile as sf

SR = 24000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "voice", "voice_ref.wav")
OUT_REL = "audio/voice.wav"
OUT = os.path.join(ROOT, "public", OUT_REL)

_chatter = None
_kokoro = None


def load_chatterbox():
    global _chatter
    if _chatter is None:
        import torch

        _orig = torch.load

        def _cpu_load(*a, **k):
            k.setdefault("map_location", "cpu")
            return _orig(*a, **k)

        torch.load = _cpu_load
        try:
            import perth

            if getattr(perth, "PerthImplicitWatermarker", None) is None:
                class _Noop:
                    def apply_watermark(self, wav, sample_rate=None, **_):
                        return wav

                    def get_watermark(self, wav, sample_rate=None, **_):
                        return None

                perth.PerthImplicitWatermarker = _Noop
        except Exception:
            pass
        from chatterbox.tts import ChatterboxTTS

        _chatter = ChatterboxTTS.from_pretrained(device="cpu")
    return _chatter


def to_mono_24k(wav, sr):
    wav = np.asarray(wav, dtype=np.float32)
    if wav.ndim > 1:
        wav = wav.mean(axis=0) if wav.shape[0] < wav.shape[-1] else wav.mean(axis=1)
    if sr != SR:
        n = int(round(len(wav) * SR / sr))
        wav = np.interp(np.linspace(0, len(wav) - 1, n), np.arange(len(wav)), wav).astype(np.float32)
    return wav


def synth_mine(text):
    m = load_chatterbox()
    # Slightly more expressive + a touch faster than default = Gen-Z explainer pacing.
    wav = m.generate(text, audio_prompt_path=REF, exaggeration=0.6, cfg_weight=0.4)
    return to_mono_24k(wav.squeeze().cpu().numpy(), m.sr)


def synth_kokoro(text):
    global _kokoro
    if _kokoro is None:
        from kokoro import KPipeline

        _kokoro = KPipeline(lang_code="a")
    chunks = [a for _, _, a in _kokoro(text, voice="am_michael", speed=1.08) if a is not None]
    return to_mono_24k(np.concatenate(chunks) if chunks else np.zeros(1), 24000)


def synth_edge(text):
    import edge_tts
    import tempfile

    async def go(path):
        await edge_tts.Communicate(text, "en-US-AndrewMultilingualNeural", rate="+8%").save(path)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        path = f.name
    asyncio.run(go(path))
    import subprocess

    wav_path = path + ".wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", str(SR), "-ac", "1", wav_path], check=True)
    data, sr = sf.read(wav_path)
    return to_mono_24k(data, sr)


def trim(wav, thresh=0.012, pad=0.04):
    """Cut leading/trailing silence (TTS engines add plenty), keep a short natural pad."""
    idx = np.where(np.abs(wav) > thresh)[0]
    if not len(idx):
        return wav
    a = max(0, idx[0] - int(pad * SR))
    b = min(len(wav), idx[-1] + int(pad * SR * 2))
    return wav[a:b]


def speakable(text):
    """Normalise symbols a TTS engine would stumble on (never changes meaning)."""
    t = text.replace("→", " to ").replace("&", " and ").replace("%", " percent").replace("×", " times ")
    t = re.sub(r"[\U0001F000-\U0001FFFF☀-➿]", "", t)
    t = re.sub(r"[*_#`]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def main():
    props_path = sys.argv[1] if len(sys.argv) > 1 else "out/props.json"
    mode = (os.environ.get("VOICE") or "mine").lower()
    props = json.load(open(props_path, encoding="utf-8"))
    job = props["job"]
    if mode == "none":
        print("VOICE=none — rendering without narration")
        return

    engines = {"mine": [synth_mine, synth_kokoro, synth_edge], "kokoro": [synth_kokoro, synth_edge], "edge": [synth_edge]}[mode if mode in ("mine", "kokoro", "edge") else "mine"]
    if engines[0] is synth_mine and not os.path.exists(REF):
        print(f"! {REF} missing — falling back to Kokoro")
        engines = engines[1:]

    used = None
    segments = []
    for i, beat in enumerate(job["beats"]):
        text = speakable(beat.get("text", ""))
        if not text:
            segments.append(np.zeros(int(0.4 * SR), dtype=np.float32))
            continue
        wav = None
        for eng in engines:
            try:
                wav = trim(eng(text))
                if used is None:
                    used = eng.__name__
                elif used != eng.__name__:
                    print(f"  beat {i}: fell back to {eng.__name__}")
                break
            except Exception as e:  # keep going on the next engine
                print(f"  beat {i}: {eng.__name__} failed: {e}")
                engines = [x for x in engines if x is not eng] or engines
        if wav is None:
            raise SystemExit("All TTS engines failed.")
        segments.append(wav)
        print(f"  beat {i + 1}/{len(job['beats'])}: {len(wav) / SR:4.1f}s  {text[:70]}")

    # Join with natural pauses and record each beat's speech window.
    audio, words, t = [], [], 0.18  # small lead-in so the first frame isn't mid-syllable
    audio.append(np.zeros(int(t * SR), dtype=np.float32))
    for beat, seg in zip(job["beats"], segments):
        start, dur = t, len(seg) / SR
        audio.append(seg)
        t += dur
        tokens = beat.get("text", "").split()
        if tokens:
            weights = [len(re.sub(r"[^\w]", "", w)) + 1.2 for w in tokens]
            total, acc = sum(weights), 0.0
            for w, wt in zip(tokens, weights):
                s = start + acc / total * dur
                acc += wt
                words.append({"w": w, "start": round(s, 3), "end": round(start + acc / total * dur, 3)})
        txt = beat.get("text", "").strip()
        gap = 0.32 if re.search(r"[.!?]['\")\]]?$", txt) else 0.16 if re.search(r"[,;:—–]$", txt) else 0.2
        gap += float(beat.get("hold") or 0)
        audio.append(np.zeros(int(gap * SR), dtype=np.float32))
        t += gap

    full = np.concatenate(audio)
    peak = float(np.max(np.abs(full))) or 1.0
    full = (full / peak * 0.89).astype(np.float32)  # -1 dBFS peak, consistent level
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, full, SR)

    job["audio"] = OUT_REL
    job["words"] = words
    job["voice"] = used
    json.dump(props, open(props_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    msg = f"🎙️ Narration: {used} · {len(full) / SR:.1f}s · {len(words)} words timed"
    print(msg)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(msg + "\n")


if __name__ == "__main__":
    main()
