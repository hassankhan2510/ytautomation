"""
STUDIO — NARRATE: speak every beat of a render-props job and lock the timeline to the real audio.

  python scripts/narrate.py out/props.json            (edits the props in place)

Env: VOICE = mine (Chatterbox clone, English) | omnivoice (OmniVoice clone — Urdu + English, Apache-2.0)
          | kokoro | edge | none
Urdu reels: each beat may carry `speak` (Urdu script) — the voice reads that while the screen shows `text`.

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
_omni = None
_omni_prompt = None
_omni_lang_arg = None
_omni_has_speed = False


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


def load_omnivoice():
    """OmniVoice (k2-fsa) on CPU. One voice-clone prompt from an 8 s clip of the reference (3-10 s is
    what OmniVoice recommends), reused for every beat."""
    global _omni, _omni_prompt, _omni_lang_arg, _omni_has_speed
    if _omni is None:
        import inspect
        import subprocess
        import tempfile

        import torch
        from omnivoice import OmniVoice

        torch.set_num_threads(os.cpu_count() or 4)
        _omni = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cpu", dtype=torch.float32)
        params = inspect.signature(_omni.generate).parameters
        _omni_lang_arg = next((p for p in ("language", "language_id", "lang") if p in params), None)
        _omni_has_speed = "speed" in params
        clip = os.path.join(tempfile.gettempdir(), "omni_ref_clip.wav")
        start = most_fluent_window(REF, 8.0)
        print(f"  reference: most fluent 8 s window starts at {start:.1f}s")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-t", "8", "-i", REF, clip], check=True)
        _omni_prompt = _omni.create_voice_clone_prompt(ref_audio=clip) if hasattr(_omni, "create_voice_clone_prompt") else clip
        print(f"  OmniVoice ready (language arg: {_omni_lang_arg})")
    return _omni


def most_fluent_window(path, win=8.0):
    """The clone copies the reference's pacing — pick the 8 s stretch with the least silence/hesitation."""
    data, sr = sf.read(path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    hop = int(sr * 0.05)
    frames = np.array([np.sqrt(np.mean(data[i:i + hop] ** 2) + 1e-12) for i in range(0, max(1, len(data) - hop), hop)])
    if not len(frames):
        return 0.0
    silent = frames < max(1e-4, np.percentile(frames, 60) * 0.25)
    n = int(win / 0.05)
    if len(silent) <= n:
        return 0.0
    csum = np.concatenate([[0], np.cumsum(silent)])
    scores = csum[n:] - csum[:-n]  # silent frames per window
    best = int(np.argmin(scores[int(0.3 / 0.05):])) + int(0.3 / 0.05)  # skip the very start
    return best * 0.05


def synth_omnivoice(text):
    m = load_omnivoice()
    lang = "ur" if re.search("[؀-ۿ]", text) else "en"  # Urdu/Arabic-script letters → Urdu
    kw = {"text": text}
    kw.update({"ref_audio": _omni_prompt} if isinstance(_omni_prompt, str) else {"voice_clone_prompt": _omni_prompt})
    if _omni_lang_arg:
        kw[_omni_lang_arg] = lang
    if _omni_has_speed:
        kw["speed"] = float(os.environ.get("VOICE_SPEED", "1.08"))  # a touch faster = more energy, fewer drags
    audio = m.generate(**kw)
    return to_mono_24k(audio[0], 24000)


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


_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_SPELL3 = {"NOT", "YES", "WHY", "HOW", "BIG", "NEW", "OLD", "ALL", "NOW", "AND", "THE", "WOW", "BUT", "WHO", "ONE", "TWO", "TEN", "TOP", "WIN", "OUT", "BAD", "GOD"}


def _u100(n):
    return _ONES[n] if n < 20 else _TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")


def _u1000(n):
    return _u100(n) if n < 100 else _ONES[n // 100] + " hundred" + (" " + _u100(n % 100) if n % 100 else "")


def _year(n):
    """1969 -> nineteen sixty nine, 2005 -> two thousand five, 1900 -> nineteen hundred, 776 -> seven hundred seventy six."""
    if n < 1000:
        return _u1000(n)
    if 2000 <= n <= 2009:
        return "two thousand" + (" " + _ONES[n % 100] if n % 100 else "")
    if n % 100 == 0:
        return _u100(n // 100) + " hundred"
    return _u100(n // 100) + " " + ("oh " + _ONES[n % 100] if n % 100 < 10 else _u100(n % 100))


def number_words(raw):
    s = raw.replace(",", "")
    if re.fullmatch(r"\d+\.\d+", s):
        a, b = s.split(".")
        return number_words(a) + " point " + " ".join(_ONES[int(d)] for d in b)
    if not s.isdigit():
        return raw
    n = int(s)
    if n > 999_999_999_999:
        return raw
    if len(s) == 4 and "," not in raw and 1100 <= n <= 2099:
        return _year(n)  # a bare 4-digit number in a reel is almost always a year
    parts = []
    for size, name in ((1_000_000_000, "billion"), (1_000_000, "million"), (1000, "thousand")):
        if n >= size:
            parts.append(_u1000(n // size) + " " + name)
            n %= size
    if n or not parts:
        parts.append(_u1000(n))
    return " ".join(parts)


def _ordinal(words):
    last = words.split()[-1]
    irregular = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}
    new = irregular.get(last) or (last[:-1] + "ieth" if last.endswith("y") else last + "th")
    return words[: len(words) - len(last)] + new


def pronounceable(word):
    """ALL-CAPS word that is said as a word (ABHI, NASA, FIFA, NEVER) rather than spelled out (UAE, IPO, HTML)."""
    if word in _SPELL3:
        return True
    w = word.upper()
    if len(w) < 4 or not w.isalpha():
        return False
    vowels = sum(c in "AEIOU" or (c == "Y" and k > 0) for k, c in enumerate(w))
    return vowels >= 2 and not re.search(r"[^AEIOUY]{3}", w) and not re.search(r"[^AEIOUY]{2}$", w)


_SCALE = {"k": "thousand", "K": "thousand", "m": "million", "M": "million", "bn": "billion", "b": "billion", "B": "billion", "t": "trillion", "T": "trillion", "tn": "trillion"}


def english_speech(text):
    """Voice-only text for English reels: the screen keeps "1969", "ABHI", "$2B"; the voice says them as words.
    (Chatterbox/Kokoro read 1969 digit by digit and spelled ABHI letter by letter.)"""
    t = text
    t = re.sub(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|million|thousand|tn|bn|[kKmMbBtT])?\b",
               lambda m: f"{number_words(m.group(1))} {_SCALE.get(m.group(2), m.group(2) or '')} dollars".replace("  ", " "), t)
    t = re.sub(r"\b(\d[\d,]*(?:\.\d+)?)(bn|[MB])\b", lambda m: f"{number_words(m.group(1))} {_SCALE[m.group(2)]}", t)
    t = re.sub(r"\b(\d{3,4})\s*(BCE|BC|CE|AD)\b", lambda m: f"{_year(int(m.group(1)))} {' '.join(m.group(2))}", t)
    t = re.sub(r"\b(\d{4})s\b", lambda m: re.sub(r"y$", "ies", _year(int(m.group(1)))) if _year(int(m.group(1))).endswith("y") else _year(int(m.group(1))) + "s", t)
    t = re.sub(r"(?<![\d,])'?(\d0)s\b", lambda m: _TENS[int(m.group(1)) // 10][:-1] + "ies", t)  # 90s -> nineties
    t = re.sub(r"\b(\d+)(st|nd|rd|th)\b", lambda m: _ordinal(number_words(m.group(1))), t)
    t = re.sub(r"(\d)([A-Za-z]{1,4})\b", r"\1 \2", t)  # 4KB -> 4 KB, 5G -> 5 G
    t = re.sub(r"\b\d[\d,]*(?:\.\d+)?\b", lambda m: number_words(m.group(0)), t)
    t = re.sub(r"\b[A-Z]{3,}\b", lambda m: m.group(0).capitalize() if pronounceable(m.group(0)) else m.group(0), t)
    return t


URDU_LETTERS = re.compile(r"[؀-ۿ]")


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

    engines = {
        "mine": [synth_mine, synth_kokoro, synth_edge],
        "omnivoice": [synth_omnivoice, synth_mine, synth_kokoro, synth_edge],
        "kokoro": [synth_kokoro, synth_edge],
        "edge": [synth_edge],
    }[mode if mode in ("mine", "omnivoice", "kokoro", "edge") else "mine"]
    if engines[0] in (synth_mine, synth_omnivoice) and not os.path.exists(REF):
        print(f"! {REF} missing — falling back to Kokoro")
        engines = engines[1:]

    used = None
    segments = []
    for i, beat in enumerate(job["beats"]):
        raw = beat.get("speak") or beat.get("text", "")
        # Urdu `speak` lines are already fixed by speakfix.mjs; everything else gets the English pass.
        text = speakable(raw if URDU_LETTERS.search(raw) else english_speech(raw))
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
        # Tight pauses keep the flow (creator found the read too stop-start).
        gap = 0.22 if re.search(r"[.!?]['\")\]]?$", txt) else 0.1 if re.search(r"[,;:—–]$", txt) else 0.14
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
