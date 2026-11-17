"""
STUDIO — TRANSCRIBE: what was actually said in an uploaded voiceover, with a time for every word.

faster-whisper (MIT, CTranslate2, int8 on CPU) with word timestamps + VAD. Output feeds align.py,
which maps the SCRIPT onto these times (or, with no script, the transcript BECOMES the script).

    python scripts/transcribe.py voiceover.mp3 out/transcript.json [en|ur|auto]
Env: WHISPER_MODEL (default "small"; "medium" = better Urdu, ~2.5x slower)
"""
import json
import os
import sys
import time


def transcribe(path, lang=None):
    from faster_whisper import WhisperModel
    size = os.environ.get("WHISPER_MODEL", "small")
    model = WhisperModel(size, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 2)
    t0 = time.time()
    segs, info = model.transcribe(path, language=lang, word_timestamps=True, vad_filter=True,
                                  vad_parameters={"min_silence_duration_ms": 300}, beam_size=5,
                                  condition_on_previous_text=False)
    words, text = [], []
    for s in segs:
        text.append(s.text.strip())
        for w in s.words or []:
            if w.word.strip():
                words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 3)})
    return {"model": size, "language": info.language, "duration": round(info.duration, 2),
            "seconds": round(time.time() - t0, 1), "text": " ".join(text), "words": words}


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    lang = (sys.argv[3] if len(sys.argv) > 3 else "auto").lower()
    lang = {"english": "en", "urdu": "ur", "auto": None}.get(lang, lang)
    tr = transcribe(src, lang)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    json.dump(tr, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    msg = f"📝 Transcribed {tr['duration']}s of {tr['language']} speech in {tr['seconds']}s ({tr['model']}): {len(tr['words'])} words"
    print(msg)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(msg + "\n")
