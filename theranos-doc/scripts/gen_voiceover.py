#!/usr/bin/env python
"""
Step 1 of the pipeline: VOICEOVER + TIMELINE.

Reads  src/data/script.json
Writes public/audio/line_XX.mp3   (one narration clip per line)
Writes src/data/timeline.json     (exact per-line frame timing + word-level caption timing)

Uses Microsoft Edge Neural TTS via the `edge-tts` package.
  - Free, no API key.
  - Gives word-level timing so captions sync perfectly.

Run:  python scripts/gen_voiceover.py
"""

import asyncio
import json
import math
import os
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

# edge-tts reports offsets/durations in 100-nanosecond "ticks".
TICKS_PER_SECOND = 10_000_000


async def synthesize(text: str, voice: str, out_path: str, rate: str = "+0%"):
    """Generate one mp3 and capture timing. `rate` speeds up/slows the voice
    (e.g. "+15%" for a snappier, modern delivery).

    Edge neural voices emit SentenceBoundary (not WordBoundary) metadata, which
    carries the real spoken offset + duration per sentence. We use the end of the
    last sentence as the true spoken length. Returns (speech_sec, word_frames_unset).
    """
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    last_end_sec = 0.0
    got_timing = False
    with open(out_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] in ("SentenceBoundary", "WordBoundary"):
                got_timing = True
                end = (chunk["offset"] + chunk["duration"]) / TICKS_PER_SECOND
                last_end_sec = max(last_end_sec, end)
    return last_end_sec if got_timing else 0.0


def distribute_words(text: str, speech_sec: float, fps: int):
    """Spread the line's words across the spoken duration, weighted by word length.

    Splitting the line's own text guarantees the word count matches what the
    caption component renders, so the karaoke highlight never drifts out of range.
    """
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


async def main():
    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        script = json.load(f)

    meta = script.get("meta", {})
    fps = int(meta.get("fps", 30))
    voice = meta.get("voice", "en-US-GuyNeural")
    rate = meta.get("voiceRate", "+10%")  # snappier default; override per video
    pause = float(meta.get("pauseBetweenLinesSec", 0.25))  # less dead air between scenes
    lines = script["lines"]

    os.makedirs(AUDIO_DIR, exist_ok=True)

    timeline_lines = []
    cursor_frame = 0

    print(f"Generating {len(lines)} narration clips with voice '{voice}' @ {fps}fps...\n")

    for i, line in enumerate(lines):
        audio_name = f"line_{i:02d}.mp3"
        out_path = os.path.join(AUDIO_DIR, audio_name)

        # `text` is what is SPOKEN (can be Hindi/Urdu). `caption` is what is SHOWN
        # on screen (English). If no caption, the spoken text is also shown.
        spoken = line["text"]
        displayed = line.get("caption") or line["text"]

        speech_sec = await synthesize(spoken, voice, out_path, rate)

        # Fallback estimate if the service returned no timing metadata at all.
        if speech_sec <= 0:
            speech_sec = max(1.5, len(spoken.split()) * 0.38)

        total_sec = speech_sec + pause
        duration_frames = max(int(round(total_sec * fps)), fps)  # never shorter than 1s

        # Word timings (frames) relative to this line's local start, for karaoke captions.
        # Uses the DISPLAYED (on-screen) text so the highlight matches what's shown.
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
                # Optional richer-visual fields (backward compatible).
                "layout": line.get("layout", "lower-third"),
                "kicker": line.get("kicker"),
                "stat": line.get("stat"),
                "cite": line.get("cite"),
                "items": line.get("items"),
                # Data-block payloads (all optional).
                "chart": line.get("chart"),
                "compare": line.get("compare"),
                "events": line.get("events"),
                "percent": line.get("percent"),
                "name": line.get("name"),
                "role": line.get("role"),
                "location": line.get("location"),
                "coords": line.get("coords"),
                "collageAssets": line.get("collageAssets"),
                "words": word_frames,
            }
        )

        cursor_frame += duration_frames
        bar = "#" * int((i + 1) / len(lines) * 30)
        print(f"  [{i + 1:>2}/{len(lines)}] {speech_sec:5.1f}s  {audio_name}  {bar}")

    # Optional background music bed. Only enabled if the file actually exists,
    # so a missing/unset track never breaks the render — it just plays no music.
    music_name = meta.get("music")
    music_rel = None
    if music_name:
        music_path = os.path.join(ROOT, "public", "music", music_name)
        if os.path.exists(music_path):
            music_rel = f"music/{music_name}"
        else:
            print(f"NOTE: meta.music '{music_name}' not found in public/music/ — rendering without music.")

    timeline = {
        "fps": fps,
        "totalDurationInFrames": cursor_frame,
        "totalSeconds": round(cursor_frame / fps, 1),
        "accentColor": meta.get("accentColor", "#e11d48"),
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

    # --- HARD DURATION CONSTRAINT -------------------------------------------
    # If the brief asked for N minutes, refuse to proceed on a script that is
    # obviously too short (the "AI got lazy and made 1 minute" problem).
    target = meta.get("targetSeconds")
    target = (float(target) / 60.0) if target else meta.get("targetDurationMin")
    if target:
        target = float(target)
        floor = target * 0.75  # tolerate faster pacing; line-count gate guards laziness
        avg_sec_per_line = (cursor_frame / fps) / max(len(lines), 1)
        if mins < floor:
            missing_min = target - mins
            needed_lines = int(math.ceil((missing_min * 60) / max(avg_sec_per_line, 1)))
            print("\n" + "=" * 66)
            print("  [X] DURATION CHECK FAILED")
            print(f"  Requested : {target:.0f} min")
            print(f"  Produced  : {mins:.1f} min  ({len(lines)} lines)")
            print(f"  Shortfall : ~{missing_min:.1f} min  ->  add ~{needed_lines} more lines")
            print("  Fix: regenerate script.json with more lines, then re-run.")
            print("=" * 66)
            sys.exit(2)
        else:
            print(f"[OK] Duration check passed: {mins:.1f} min vs {target:.0f} min target.")


if __name__ == "__main__":
    asyncio.run(main())
