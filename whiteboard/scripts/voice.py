"""
VOICEOVER + TIMING — narrate each scene with Kokoro (free, CPU, natural), concatenate into one track,
and rewrite scenes.json so every scene's `from`/`durationInFrames` matches the real spoken length.
Writes public/audio/voice.wav. Fully best-effort: if Kokoro isn't available it leaves the fixed
timing untouched (the video still renders, just silent).

  python scripts/voice.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENES = os.path.join(ROOT, "src", "data", "scenes.json")
AUDIO_DIR = os.path.join(ROOT, "public", "audio")

VOICE = os.environ.get("WB_KOKORO_VOICE", "am_michael")
SPEED = float(os.environ.get("WB_VOICE_SPEED", "1.05"))
SR = 24000  # Kokoro sample rate

def main():
    with open(SCENES, "r", encoding="utf-8") as f:
        data = json.load(f)
    fps = int(data.get("fps", 30))
    scenes = data.get("scenes", [])
    if not scenes:
        print("no scenes"); return

    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except Exception as e:
        print(f"NOTE: Kokoro/soundfile unavailable ({e}) — leaving fixed timing, rendering silent.")
        return

    try:
        pipe = KPipeline(lang_code="a")  # American English
    except Exception as e:
        print(f"NOTE: Kokoro pipeline failed to load ({e}) — silent render.")
        return

    os.makedirs(AUDIO_DIR, exist_ok=True)
    gap = np.zeros(int(0.35 * SR), dtype="float32")
    track = []
    cursor = 0

    for i, s in enumerate(scenes):
        text = (s.get("text") or "").strip()
        try:
            parts = [a for _, _, a in pipe(text, voice=VOICE, speed=SPEED) if a is not None]
            audio = np.concatenate(parts) if parts else np.zeros(int(1.2 * SR), dtype="float32")
        except Exception as e:
            print(f"  ! scene {i} synth failed ({e}); using a short gap")
            audio = np.zeros(int(1.4 * SR), dtype="float32")
        dur_sec = len(audio) / SR + 0.35
        frames = max(fps, int(round(dur_sec * fps)))
        s["from"] = cursor
        s["durationInFrames"] = frames
        cursor += frames
        track.append(np.asarray(audio, dtype="float32"))
        track.append(gap)
        print(f"  [{i+1}/{len(scenes)}] {dur_sec:4.1f}s  {frames:>3}f  {text[:52]}")

    full = np.concatenate(track) if track else np.zeros(1, dtype="float32")
    sf.write(os.path.join(AUDIO_DIR, "voice.wav"), full, SR)
    data["audio"] = "audio/voice.wav"
    data["totalDurationInFrames"] = cursor + 15
    with open(SCENES, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"\n+ public/audio/voice.wav  ({cursor} frames total)\n+ scenes.json timing synced")

if __name__ == "__main__":
    main()
