"""
Kokoro voiceover for the whiteboard explainer. Reads src/data/scenes.json, synthesizes one clip per
scene into public/audio/line_NN.wav, and rewrites each scene's real timing (startFrame /
durationInFrames) + audio path + the total. Falls back to word-count-estimated timing (no audio) if
Kokoro isn't installed, so `npm run render` still works.

  pip install kokoro soundfile   (+ apt espeak-ng)
  python scripts/voice.py
"""
import json, os, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENES = os.path.join(ROOT, "src", "data", "scenes.json")
AUDIO_DIR = os.path.join(ROOT, "public", "audio")
FPS = 30
PAUSE = 0.35          # gap after each line
VOICE = os.environ.get("KOKORO_VOICE", "am_michael")
SR = 24000

def load_kokoro():
    from kokoro import KPipeline
    return KPipeline(lang_code="a")

def main():
    with open(SCENES, "r", encoding="utf-8") as f:
        doc = json.load(f)
    os.makedirs(AUDIO_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(AUDIO_DIR, "line_*")):
        try: os.remove(old)
        except OSError: pass

    pipe = None
    try:
        import numpy as np, soundfile as sf
        pipe = load_kokoro()
        print(f"Kokoro ready (voice {VOICE})")
    except Exception as e:
        print(f"NOTE: Kokoro unavailable ({e}) — using word-estimated timing, no audio.")

    cursor = 0
    for i, s in enumerate(doc["scenes"]):
        text = s.get("text", "")
        speech = 0.0
        if pipe is not None:
            try:
                import numpy as np, soundfile as sf
                chunks = [a for _, _, a in pipe(text, voice=VOICE, speed=1.0) if a is not None]
                if chunks:
                    audio = np.concatenate(chunks)
                    speech = len(audio) / SR
                    name = f"line_{i:02d}.wav"
                    sf.write(os.path.join(AUDIO_DIR, name), audio, SR)
                    s["audio"] = f"audio/{name}"
            except Exception as e:
                print(f"  ! scene {i} synth failed ({e})")
        if speech <= 0:
            speech = max(1.6, len(text.split()) * 0.40)  # estimate
            s.pop("audio", None)
        dur = max(FPS, int(round((speech + PAUSE) * FPS)))
        s["startFrame"] = cursor
        s["durationInFrames"] = dur
        cursor += dur
        print(f"  [{i+1}/{len(doc['scenes'])}] {speech:4.1f}s  {text[:48]}")

    doc["totalDurationInFrames"] = cursor
    with open(SCENES, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
    print(f"\nUpdated timing -> total {cursor} frames ({cursor/FPS:.1f}s). Now: npm run render")

if __name__ == "__main__":
    main()
