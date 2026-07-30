# 🎬 Worked Example — Theranos (6-min dark documentary)

> **Note:** This file used to contain a hand-written `.tsx` video. That approach is retired.
> The pipeline no longer generates React code per video — the AI now generates **data**
> (`script.json`) and a fixed engine renders it. This is the reference example of that data.

## The brief that produced it

```
Topic:     The rise and fall of Theranos and Elizabeth Holmes.
Style:     dark-documentary
Duration:  6 min
Platform:  youtube
```

## What the AI produced

The full script lives in **`theranos-doc/src/data/script.json`** — 45 lines, meta block with
title, voice (`en-US-GuyNeural`), crimson accent, description, and tags. Open it to see the exact
shape your own briefs should produce.

## What the pipeline did with it

1. `npm run voiceover` → 45 narration clips (`public/audio/`) + `timeline.json`
   (total runtime ≈ **5.2 min**, timing driven by the real spoken audio, not fixed 8-second blocks).
2. `npm run assets` → confirmed all backgrounds present in `public/assets/`.
3. `npm run render:youtube` → `out/video.mp4` (1080p, h264 + AAC narration).

## What changed vs. the first attempt

| Before | Now |
|---|---|
| Silent text boxes | Real AI voiceover per line |
| Hard-coded 8s per line | Timing driven by actual audio length |
| Static full-sentence text | Karaoke word-by-word highlight synced to speech |
| Manual "download from Pexels" | Automatic keyword-based asset download |
| 16:9 only | 16:9 + 9:16 + 1:1 from one source |
| AI rewrites `.tsx` each time | AI writes only `script.json` (data) |

See `PIPELINE.md` to make your next one.
