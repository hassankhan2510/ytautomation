"""
STUDIO — NARRATE: speak every beat of a render-props job and lock the timeline to the real audio.

  python scripts/narrate.py out/props.json            (edits the props in place)

Env: VOICE = mine (Chatterbox clone, English) | omnivoice (OmniVoice clone — Urdu + English, Apache-2.0)
          | kokoro | edge | none
     Another cloned speaker: add "-<name>" (e.g. mine-sufyan, omnivoice-sufyan) -> uses voice/<name>.wav
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
        globals()["_omni_has_steps"] = "num_step" in params
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
        kw["speed"] = SPEED  # PACE: the engine speaks faster itself (natural pitch, natural prosody)
    if globals().get("_omni_has_steps"):
        # 32 diffusion steps = the makers' default = best quality (slower). VOICE_STEPS=16 is their "faster" setting.
        kw["num_step"] = int(os.environ.get("VOICE_STEPS", "32"))
    audio = m.generate(**kw)
    return to_mono_24k(audio[0], 24000)


def synth_kokoro(text):
    global _kokoro
    if _kokoro is None:
        from kokoro import KPipeline

        _kokoro = KPipeline(lang_code="a")
    chunks = [a for _, _, a in _kokoro(text, voice="am_michael", speed=SPEED) if a is not None]
    return to_mono_24k(np.concatenate(chunks) if chunks else np.zeros(1), 24000)


def synth_edge(text):
    import edge_tts
    import tempfile

    async def go(path):
        await edge_tts.Communicate(text, "en-US-AndrewMultilingualNeural", rate=f"{round((SPEED - 1) * 100):+d}%").save(path)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        path = f.name
    asyncio.run(go(path))
    import subprocess

    wav_path = path + ".wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", str(SR), "-ac", "1", wav_path], check=True)
    data, sr = sf.read(wav_path)
    return to_mono_24k(data, sr)


# PACE — energetic reels: the voice itself speaks faster (each engine's own speed control, so pitch and
# prosody stay natural) and the pauses between lines get tighter. VOICE_SPEED still overrides the speed.
PACES = {"normal": (1.08, 1.0, 0.18), "fast": (1.2, 0.55, 0.1), "turbo": (1.32, 0.35, 0.06)}
PACE = os.environ.get("PACE", "normal") if os.environ.get("PACE", "normal") in PACES else "normal"
SPEED = float(os.environ.get("VOICE_SPEED") or PACES[PACE][0])
GAP_SCALE, LEAD_IN = PACES[PACE][1], PACES[PACE][2]


def tempo(wav, factor):
    """Pitch-preserving speed-up for an engine without its own speed control (Chatterbox clone)."""
    if abs(factor - 1) < 0.01 or not len(wav):
        return wav
    import subprocess
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
                        "-af", f"atempo={factor:.3f}", "-f", "f32le", "-ar", str(SR), "-ac", "1", "pipe:1"],
                       input=wav.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def _lowpass(x, hz):
    """zero-phase FFT low-pass with a soft 400 Hz roll-off (short tails only)."""
    n = len(x)
    if n < 16:
        return x
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(n, 1 / SR)
    X *= np.clip((hz + 400 - fr) / 400, 0, 1)
    return np.fft.irfft(X, n).astype(np.float32)


def clean_edges(wav, fade_in=0.008):
    """Remove the 'd'/'b' sound at the end of every line.

    Measured on real reels (Nov 2026): the voice engine ends each line in CREAKY voice — sharp, isolated
    glottal pulses that start while the last vowel is still fading (v2 only cut after the vowel and they
    survived: same pulse count in the next reel). A pulse is a broadband click — that is what the ear hears
    as 'd'/'b'; the vowel itself lives below ~2 kHz. So, from where the last vowel starts to FADE:
      1. cross-fade into a low-passed copy (clicks lose their bite, the vowel keeps its body),
      2. fade the decay out (cosine), cut 15 ms after the last real speech.
    (No hard limiter: v3's clipped every voice cycle and added a broadband crackle — seen in a real reel.)
    Returns (wav, removed_seconds, pulses_clamped)."""
    n0 = len(wav)
    f = int(0.01 * SR)
    if n0 < 8 * f:
        return wav, 0.0, 0
    nf = n0 // f
    fr = wav[: nf * f].reshape(nf, f)
    rms = np.sqrt(np.mean(fr ** 2, axis=1)) + 1e-9
    crest = np.max(np.abs(fr), axis=1) / rms
    ref = np.percentile(rms, 90)
    speech = (rms >= ref * 10 ** (-30 / 20)) & (crest < 4.5)
    idx = np.where(speech)[0]
    if not len(idx):
        return wav, 0.0, 0
    end = min(n0, (idx[-1] + 1) * f + int(0.015 * SR))
    w = wav[:end].astype(np.float32).copy()
    # where the last vowel starts to fade: last frame within 6 dB of the line's loud level
    loud = np.where(rms[: max(1, end // f)] >= ref * 10 ** (-6 / 20))[0]
    fade_at = int((loud[-1] + 1) * f) if len(loud) else max(0, end - int(0.12 * SR))
    # the FIRST click in the last 250 ms: a 1 ms spike of the >2 kHz signal far above its neighbourhood
    lo = max(0, end - int(0.25 * SR))
    hf = w[lo:] - _lowpass(w[lo:], 2000.0)
    m1 = int(0.001 * SR)
    nb = len(hf) // m1
    first_click = None
    if nb > 30:
        pk = np.abs(hf[: nb * m1]).reshape(nb, m1).max(1)
        for i in range(nb):
            ring = pk[max(0, i - 15):i + 15]
            if pk[i] > 6 * np.median(ring) and pk[i] > 0.01 and pk[i] == ring.max():
                first_click = lo + i * m1
                break
    ds = min(fade_at, first_click - int(0.01 * SR)) if first_click is not None else fade_at
    ds = max(lo, min(ds, end - int(0.06 * SR)))  # treat between the last 60 and 250 ms
    tail = w[ds:].copy()
    L = len(tail)
    pulses = 0
    if L > 8:
        # 1. into a low-passed copy over 20 ms (clicks lose their bite, the vowel keeps its body)
        ctx = min(ds, int(0.02 * SR))
        lp = _lowpass(w[ds - ctx:], 1500.0)[ctx:]
        k = min(L, int(0.02 * SR))
        mix = np.ones(L, dtype=np.float32)
        mix[:k] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, k))
        tail = (1 - mix) * tail + mix * lp
        pulses = 1
        w[ds:] = tail
    # 3. fade out over the decay only (the last word keeps its loudness)
    fo_start = max(fade_at, end - int(0.1 * SR))
    fo = len(w) - fo_start
    if fo > 8:
        w[fo_start:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))).astype(np.float32)
    fi = min(int(fade_in * SR), len(w) // 4)
    if fi:
        w[:fi] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, fi))
    return w, (n0 - end) / SR, pulses


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
    # Urdu/Arabic punctuation -> plain punctuation for the VOICE only (captions keep the original):
    # the Urdu full stop "۔" sits at the end of almost every Urdu sentence and the voice engine read it
    # as a letter ("d") every time; "،" / "؟" / "؛" likewise. As . , ? ; they become natural pauses.
    t = (text.replace("۔", ". ").replace("،", ", ").replace("؟", "? ").replace("؛", "; ").replace("٪", " percent")
         .replace("—", ", ").replace("–", ", "))
    t = re.sub(r"[​-‏⁦-⁩﻿]", "", t)  # invisible direction / zero-width marks
    t = t.replace("→", " to ").replace("&", " and ").replace("%", " percent").replace("×", " times ")
    t = re.sub(r"[\U0001F000-\U0001FFFF☀-➿]", "", t)
    t = re.sub(r"[*_#`]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def use_voiceover(props_path, props):
    """VOICE=upload: the creator's own voiceover (ElevenLabs / phone / studio mic) IS the narration.
    No TTS. The script's words are placed on the real audio by align.py (cross-script aware), so captions
    and scene cuts follow the actual delivery — ad-libs, skipped words and Urdu/Roman spelling included."""
    import subprocess
    from align import timed_script
    src = os.environ.get("VOICEOVER", "")
    if not src or not os.path.exists(src):
        raise SystemExit(f"VOICE=upload but VOICEOVER file not found: {src!r}")
    job = props["job"]
    tr_path = os.environ.get("TRANSCRIPT", "out/transcript.json")
    if os.path.exists(tr_path):
        tr = json.load(open(tr_path, encoding="utf-8"))
    else:
        from transcribe import transcribe
        tr = transcribe(src, {"urdu": "ur", "english": "en"}.get((os.environ.get("LANGUAGE") or "").lower()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # broadcast-level loudness, mono, 48 kHz; nothing else touched (it's the creator's own sound)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "48000", "-ac", "1", OUT], check=True)
    tokens = [w for b in job["beats"] for w in b.get("text", "").split()]
    words, rate = timed_script(tokens, tr["words"])
    job["audio"] = OUT_REL
    job["words"] = words
    job["voice"] = "upload"
    json.dump(props, open(props_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    msg = (f"🎙️ Narration: your voiceover · {tr.get('duration', 0):.1f}s · {len(words)} script words placed on it "
           f"({100 * rate:.0f}% matched to spoken words, the rest interpolated)")
    print(msg)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(msg + "\n")


def main():
    props_path = sys.argv[1] if len(sys.argv) > 1 else "out/props.json"
    global REF
    mode = (os.environ.get("VOICE") or "mine").lower()
    if "-" in mode:  # mine-sufyan / omnivoice-sufyan -> same engine, that speaker's sample
        mode, speaker = mode.split("-", 1)
        cand = os.path.join(ROOT, "voice", f"{speaker}.wav")
        if os.path.exists(cand):
            REF = cand
            print(f"voice sample: {speaker} ({cand})")
        else:
            print(f"! voice/{speaker}.wav missing — using the default voice_ref.wav")
    if (os.environ.get("LANGUAGE") or "").lower() == "urdu" and mode not in ("none", "upload"):
        mode = "omnivoice"  # Urdu reels always use OmniVoice (the Chatterbox clone is English-only)
    props = json.load(open(props_path, encoding="utf-8"))
    job = props["job"]
    if mode == "none":
        print("VOICE=none — rendering without narration")
        return
    if mode == "upload":
        return use_voiceover(props_path, props)

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
    # LINE-BY-LINE VOICE: every spoken line is cached by (engine, voice sample, speed, exact text). After an
    # edit only the changed lines are synthesised again — the rest come from the cache (VOICE_CACHE dir,
    # kept between runs of the same project by the workflow).
    cache_dir = os.environ.get("VOICE_CACHE")
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
    ref_id = f"{os.path.basename(REF)}:{os.path.getsize(REF)}" if os.path.exists(REF) else "noref"
    hits = 0
    tail_fix = []

    def cache_path(eng_name, text, tag="raw"):
        # tag "raw": the engine's line BEFORE clean_edges (so cleanup improvements never need re-synthesis);
        # tag "edges2": older caches, stored already cleaned once (cleaned again on top: harmless)
        import hashlib
        h = hashlib.sha1(f"{eng_name}|{ref_id}|{SPEED}|{os.environ.get('VOICE_STEPS', '32')}|{tag}|{text}".encode("utf-8")).hexdigest()[:20]
        return os.path.join(cache_dir, f"{h}.npy") if cache_dir else None

    for i, beat in enumerate(job["beats"]):
        raw = beat.get("speak") or beat.get("text", "")
        # Urdu `speak` lines are already fixed by speakfix.mjs; everything else gets the English pass.
        text = speakable(raw if URDU_LETTERS.search(raw) else english_speech(raw))
        if not text:
            segments.append(np.zeros(int(0.4 * SR), dtype=np.float32))
            continue
        cp = cache_path(engines[0].__name__, text)
        if cp and not os.path.exists(cp):
            cp = cache_path(engines[0].__name__, text, "edges2")
        if cp and os.path.exists(cp):
            wav, cut, pulses = clean_edges(np.load(cp))
            if cut > 0.02 or pulses:
                tail_fix.append((cut, pulses))
            segments.append(wav)
            used = used or engines[0].__name__
            hits += 1
            print(f"  beat {i + 1}/{len(job['beats'])}: {len(wav) / SR:4.1f}s  (cached)  {text[:60]}")
            continue
        wav = None
        for eng in engines:
            try:
                wav = trim(eng(text))
                if eng is synth_mine:  # Chatterbox has no speed control of its own
                    wav = tempo(wav, SPEED / 1.08)
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
        cpu = cache_path(used or engines[0].__name__, text)
        if cpu and (used or engines[0].__name__) == engines[0].__name__:  # only cache the primary voice
            np.save(cpu, wav.astype(np.float32))  # raw: cleaned below, every run
        wav, cut, pulses = clean_edges(wav)
        if cut > 0.02 or pulses:
            tail_fix.append((cut, pulses))
        segments.append(wav)
        print(f"  beat {i + 1}/{len(job['beats'])}: {len(wav) / SR:4.1f}s  {text[:70]}")
    if cache_dir:
        spoken = sum(1 for b in job["beats"] if (b.get("speak") or b.get("text", "")).strip())
        print(f"  voice cache: {hits}/{spoken} spoken lines reused, {spoken - hits} synthesised")
    print(f"  pace: {PACE} (voice speed {SPEED:.2f}, pauses x{GAP_SCALE})")
    if tail_fix:
        print(f"  line endings cleaned: {len(tail_fix)} lines · {sum(c for c, _ in tail_fix):.2f}s of trailing creak cut · "
              f"{sum(p for _, p in tail_fix)} line endings softened")

    # Join with natural pauses and record each beat's speech window.
    audio, words, t = [], [], LEAD_IN  # small lead-in so the first frame isn't mid-syllable
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
        gap = max(0.04, gap * GAP_SCALE)
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
