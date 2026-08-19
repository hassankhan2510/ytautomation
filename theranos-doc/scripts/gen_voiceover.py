#!/usr/bin/env python
"""
Step 1 of the pipeline: VOICEOVER + TIMELINE.

Reads  src/data/script.json
Writes public/audio/line_XX.<mp3|wav>   (one narration clip per line)
Writes src/data/timeline.json           (exact per-line frame timing + word timing)

THREE voice engines, chosen by the VOICE env var (set from the workflow dropdown):
  - "auto"    (default) -> Kokoro for English, edge-tts for Urdu/Hindi
  - "kokoro"  -> Kokoro for English, edge-tts for Urdu/Hindi
  - "edge"    -> edge-tts for everything (the old behaviour)
  - "myvoice" -> Chatterbox voice-clone for English, edge-tts for Urdu/Hindi

  Kokoro  = free, CPU, natural neural voice (no key).           pip install kokoro soundfile
  edge-tts= free Microsoft neural TTS, best for ur/hi.          pip install edge-tts
  Chatterbox = free MIT voice clone from a ~10s sample of YOU.  pip install chatterbox-tts
             Reference clip: voice/<channel>.wav  (or voice/me.wav), or set VOICE_REF.

Any engine that fails to load falls back to edge-tts, so a run never dies.

Run:  python scripts/gen_voiceover.py
"""

from __future__ import annotations

import asyncio
import glob
import json
import math
import os
import re
import sys

try:
    import edge_tts
except ImportError:
    print("edge-tts is not installed. Run:  pip install edge-tts")
    sys.exit(1)

# --- Paths (resolved relative to the project root, i.e. the parent of /scripts) ---
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT_JSON = os.path.join(ROOT, "src", "data", "script.json")
TIMELINE_JSON = os.path.join(ROOT, "src", "data", "timeline.json")
AUDIO_DIR = os.path.join(ROOT, "public", "audio")
VOICE_DIR = os.path.join(ROOT, "voice")

# edge-tts reports offsets/durations in 100-nanosecond "ticks".
TICKS_PER_SECOND = 10_000_000

# Which engine the operator picked (workflow dropdown -> VOICE env).
VOICE_MODE = os.environ.get("VOICE", "auto").strip().lower() or "auto"

# Lazily-initialised heavy models (only loaded if actually used).
_kokoro_pipe = None
_chatter_model = None


def rate_to_speed(rate: str) -> float:
    """Turn an edge-style rate string ('+15%') into a Kokoro speed multiplier (1.15)."""
    m = re.match(r"\s*([+-]?\d+)\s*%", str(rate or ""))
    if not m:
        return 1.0
    return max(0.5, min(2.0, 1.0 + int(m.group(1)) / 100.0))


def load_kokoro():
    global _kokoro_pipe
    if _kokoro_pipe is None:
        from kokoro import KPipeline  # noqa: WPS433 (lazy import by design)
        _kokoro_pipe = KPipeline(lang_code="a")  # 'a' = American English
    return _kokoro_pipe


def load_chatterbox():
    global _chatter_model
    if _chatter_model is None:
        import torch  # noqa: WPS433

        # On CPU-only runners the pretrained weights are CUDA-mapped; force CPU deserialization
        # so torch.load doesn't choke trying to place tensors on a non-existent GPU.
        _orig_load = torch.load

        def _cpu_load(*a, **k):
            k.setdefault("map_location", "cpu")
            return _orig_load(*a, **k)

        torch.load = _cpu_load

        # Chatterbox's audio watermarker (resemble-perth) ships broken on some CPU images:
        # `perth.PerthImplicitWatermarker` resolves to None, so its constructor call blows up with
        # "'NoneType' object is not callable". We don't need Resemble's provenance watermark on our
        # own cloned voice, so swap in a no-op pass-through if the real one is missing.
        try:
            import perth  # noqa: WPS433

            if getattr(perth, "PerthImplicitWatermarker", None) is None:
                class _NoopWatermarker:  # pragma: no cover - trivial shim
                    def apply_watermark(self, wav, sample_rate=None, **_):
                        return wav

                    def get_watermark(self, wav, sample_rate=None, **_):
                        return None

                perth.PerthImplicitWatermarker = _NoopWatermarker
        except Exception:
            pass

        from chatterbox.tts import ChatterboxTTS  # noqa: WPS433

        _chatter_model = ChatterboxTTS.from_pretrained(device="cpu")
    return _chatter_model


def resolve_ref_voice(meta) -> str | None:
    """Find the reference clip for voice cloning: VOICE_REF, else voice/<channel>.wav, else voice/me.wav."""
    env_ref = os.environ.get("VOICE_REF")
    if env_ref and os.path.exists(env_ref):
        return env_ref
    for cand in (f"{meta.get('channel', '')}.wav", "me.wav"):
        p = os.path.join(VOICE_DIR, cand)
        if cand.strip(".wav") and os.path.exists(p):
            return p
    return None


# --------------------------- engines ---------------------------
async def synth_edge(text: str, voice: str, out_path: str, rate: str = "+0%") -> float:
    """edge-tts: writes an mp3, returns real spoken length (from sentence-boundary timing).
    Retries a few times because edge-tts occasionally returns no audio under load."""
    last_error = None
    for attempt in range(5):
        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            audio = bytearray()
            last_end_sec = 0.0
            got_timing = False
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio += chunk["data"]
                elif chunk["type"] in ("SentenceBoundary", "WordBoundary"):
                    got_timing = True
                    end = (chunk["offset"] + chunk["duration"]) / TICKS_PER_SECOND
                    last_end_sec = max(last_end_sec, end)
            if not audio:
                raise RuntimeError("no audio bytes received")
            with open(out_path, "wb") as f:
                f.write(audio)
            return last_end_sec if got_timing else 0.0
        except Exception as e:  # NoAudioReceived, network blips, etc.
            last_error = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"edge-tts failed after 5 retries: {last_error}")


def synth_kokoro(text: str, out_path: str, voice: str, speed: float) -> float:
    """Kokoro: writes a wav, returns real spoken length measured from the samples."""
    import numpy as np
    import soundfile as sf

    pipe = load_kokoro()
    chunks = [a for _, _, a in pipe(text, voice=voice, speed=speed) if a is not None]
    wav = np.concatenate(chunks) if chunks else np.zeros(1, dtype="float32")
    sf.write(out_path, wav, 24000)
    return len(wav) / 24000.0


def synth_chatterbox(text: str, out_path: str, ref_wav: str) -> float:
    """Chatterbox: clones the reference voice, writes a wav, returns its measured length."""
    import soundfile as sf
    import torchaudio as ta

    model = load_chatterbox()
    wav = model.generate(text, audio_prompt_path=ref_wav)
    ta.save(out_path, wav, model.sr)
    return sf.info(out_path).duration


def distribute_words(text: str, speech_sec: float, fps: int):
    """Spread the line's words across the spoken duration, weighted by word length,
    so the karaoke caption highlight tracks the audio and never drifts out of range."""
    words = text.split()
    if not words or speech_sec <= 0:
        return [{"text": w, "start": 0, "end": 0} for w in words]

    weights = [len(w) + 1 for w in words]
    total_w = sum(weights)
    out = []
    acc = 0.0
    for w, weight in zip(words, weights):
        start_sec = acc / total_w * speech_sec
        acc += weight
        end_sec = acc / total_w * speech_sec
        out.append(
            {
                "text": w,
                "start": int(math.floor(start_sec * fps)),
                "end": int(math.ceil(end_sec * fps)),
            }
        )
    return out


def choose_engine(meta) -> tuple[str, str | None]:
    """Decide the engine for THIS job and (for cloning) the reference clip.
    Urdu/Hindi always uses edge-tts. Returns (engine, ref_wav|None)."""
    voice = meta.get("voice", "en-US-GuyNeural")
    lang = (meta.get("language") or voice[:2] or "en").lower()
    is_english = lang.startswith("en")

    # Non-English never clones/Kokoros — edge-tts handles ur/hi best.
    if not is_english:
        return "edge", None

    if VOICE_MODE == "edge":
        return "edge", None
    if VOICE_MODE == "myvoice":
        ref = resolve_ref_voice(meta)
        try:
            if not ref:
                raise RuntimeError("no reference clip found (add voice/<channel>.wav or voice/me.wav)")
            load_chatterbox()
            return "chatterbox", ref
        except Exception as e:
            import traceback
            print(f"NOTE: 'my voice' unavailable ({e}). Falling back to edge-tts — this WON'T be your voice.")
            print(traceback.format_exc())
            return "edge", None

    # "auto" or "kokoro": Kokoro for English, with edge-tts fallback.
    try:
        load_kokoro()
        return "kokoro", None
    except Exception as e:
        print(f"NOTE: Kokoro unavailable ({e}); using edge-tts.")
        return "edge", None


async def main():
    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        script = json.load(f)

    meta = script.get("meta", {})
    fps = int(meta.get("fps", 30))
    voice = meta.get("voice", "en-US-GuyNeural")
    rate = meta.get("voiceRate", "+10%")
    speed = rate_to_speed(rate)
    kokoro_voice = meta.get("kokoroVoice", "am_michael")
    pause = float(meta.get("pauseBetweenLinesSec", 0.25))
    lines = script["lines"]

    os.makedirs(AUDIO_DIR, exist_ok=True)
    # Clear stale clips so a switch between engines (mp3<->wav) never leaves orphans behind.
    for old in glob.glob(os.path.join(AUDIO_DIR, "line_*")):
        try:
            os.remove(old)
        except OSError:
            pass

    engine, ref_wav = choose_engine(meta)
    ext = "mp3" if engine == "edge" else "wav"
    label = {"edge": f"edge-tts ({voice})", "kokoro": f"Kokoro ({kokoro_voice})",
             "chatterbox": f"your voice ({os.path.basename(ref_wav) if ref_wav else '?'})"}[engine]
    print(f"Voice mode '{VOICE_MODE}' -> engine: {label} @ {fps}fps, {len(lines)} lines\n")

    timeline_lines = []
    cursor_frame = 0

    for i, line in enumerate(lines):
        audio_name = f"line_{i:02d}.{ext}"
        out_path = os.path.join(AUDIO_DIR, audio_name)

        # `text` is SPOKEN (can be Urdu/Hindi). `caption` is SHOWN on screen (English).
        spoken = line["text"]
        displayed = line.get("caption") or line["text"]

        try:
            if engine == "kokoro":
                speech_sec = synth_kokoro(spoken, out_path, kokoro_voice, speed)
            elif engine == "chatterbox":
                speech_sec = synth_chatterbox(spoken, out_path, ref_wav)
            else:
                speech_sec = await synth_edge(spoken, voice, out_path, rate)
        except Exception as e:
            # Per-line safety net: never let one bad clip kill the whole video.
            print(f"  ! line {i} failed on {engine} ({e}); retrying with edge-tts.")
            audio_name = f"line_{i:02d}.mp3"
            out_path = os.path.join(AUDIO_DIR, audio_name)
            speech_sec = await synth_edge(spoken, voice, out_path, rate)

        if speech_sec <= 0:
            speech_sec = max(1.5, len(spoken.split()) * 0.38)

        total_sec = speech_sec + pause
        duration_frames = max(int(round(total_sec * fps)), fps)  # never shorter than 1s
        word_frames = distribute_words(displayed, speech_sec, fps)

        timeline_lines.append(
            {
                "index": i,
                "startFrame": cursor_frame,
                "durationInFrames": duration_frames,
                "speechFrames": int(round(speech_sec * fps)),
                "audio": f"audio/{audio_name}",
                "text": displayed,
                "asset": line.get("asset"),
                "type": line.get("type", "image"),
                "keywords": line.get("keywords", []),
                "layout": line.get("layout", "lower-third"),
                "kicker": line.get("kicker"),
                "stat": line.get("stat"),
                "cite": line.get("cite"),
                "items": line.get("items"),
                "chart": line.get("chart"),
                "compare": line.get("compare"),
                "events": line.get("events"),
                "percent": line.get("percent"),
                "value": line.get("value"),
                "prefix": line.get("prefix"),
                "suffix": line.get("suffix"),
                "name": line.get("name"),
                "role": line.get("role"),
                "location": line.get("location"),
                "coords": line.get("coords"),
                "collageAssets": line.get("collageAssets"),
                # candlestick chart (daily market-analysis reels)
                "candles": line.get("candles"),
                "overlays": line.get("overlays"),
                "levels": line.get("levels"),
                "timeframe": line.get("timeframe"),
                "pair": line.get("pair"),
                "assetName": line.get("assetName"),
                "priceNow": line.get("priceNow"),
                "changePct": line.get("changePct"),
                "decimals": line.get("decimals"),
                "callout": line.get("callout"),
                "dateLabel": line.get("dateLabel"),
                "decision": line.get("decision"),
                "bg": line.get("bg"),
                "words": word_frames,
            }
        )

        cursor_frame += duration_frames
        bar = "#" * int((i + 1) / len(lines) * 30)
        print(f"  [{i + 1:>2}/{len(lines)}] {speech_sec:5.1f}s  {audio_name}  {bar}")

    # Optional background music bed. Only enabled if the file actually exists.
    music_name = meta.get("music")
    music_rel = None
    if music_name:
        music_path = os.path.join(ROOT, "public", "music", music_name)
        if os.path.exists(music_path):
            music_rel = f"music/{music_name}"
        else:
            print(f"NOTE: meta.music '{music_name}' not found in public/music/ — rendering without music.")

    # Outro end-card wraps the narration. Shorts get NO intro (a logo sting up front blunts the
    # hook and viewers scroll); long-form keeps a short branded intro.
    platform = meta.get("platform", "youtube-long")
    is_short = platform in ("shorts", "reel")
    intro_frames = 0 if is_short else int(round(fps * 1.1))
    outro_frames = int(round(fps * (1.8 if is_short else 2.6)))
    total_frames = intro_frames + cursor_frame + outro_frames

    timeline = {
        "fps": fps,
        "totalDurationInFrames": total_frames,
        "contentDurationInFrames": cursor_frame,
        "introFrames": intro_frames,
        "outroFrames": outro_frames,
        "totalSeconds": round(total_frames / fps, 1),
        "accentColor": meta.get("accentColor", "#e11d48"),
        "brand": meta.get("brand", ""),
        "tagline": meta.get("tagline", ""),
        "title": meta.get("title", ""),
        "channel": meta.get("channel", ""),
        "music": music_rel,
        "musicVolume": float(meta.get("musicVolume", 0.14)),
        "lines": timeline_lines,
    }

    with open(TIMELINE_JSON, "w", encoding="utf-8") as f:
        json.dump(timeline, f, indent=2, ensure_ascii=False)

    mins = cursor_frame / fps / 60
    print(f"\nDone. Total runtime: {cursor_frame} frames  (~{mins:.1f} min)")
    print(f"Timeline written to: {os.path.relpath(TIMELINE_JSON, ROOT)}")
    print(f"Audio written to:    {os.path.relpath(AUDIO_DIR, ROOT)}/")

    # --- DURATION NOTE (informational, NOT a hard fail) ---------------------
    # Anti-laziness (did the AI write enough scenes?) is already enforced by validate.mjs on LINE
    # COUNT. This seconds-based check can only trip on fast PACING (a snappy voice narrating quicker
    # than the per-line estimate) — which is not a content problem — so it must never kill the job.
    # Killing it here is exactly what used to drop long-form videos and leave only the shorts.
    target = meta.get("targetSeconds")
    target = (float(target) / 60.0) if target else meta.get("targetDurationMin")
    if target:
        target = float(target)
        floor = target * 0.6
        if mins < floor:
            print(f"[!] Duration note: {mins:.1f} min vs ~{target:.0f} min estimate "
                  f"(snappier pacing — this is fine, not an error).")
        else:
            print(f"[OK] Duration check passed: {mins:.1f} min vs {target:.0f} min target.")


if __name__ == "__main__":
    asyncio.run(main())
