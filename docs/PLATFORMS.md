# Platform Specs

The brief's `platform` value drives everything below. Set it in `meta.platform`.

| platform | Composition to render | Aspect | Typical length | Writing style |
|---|---|---|---|---|
| `youtube-long` | `YouTube` | 16:9 (1920×1080) | 5–10 min | Deep, cinematic, story-driven. Longer flowing lines. |
| `shorts` | `Shorts` | 9:16 (1080×1920) | 15–60 sec | Punchy. Hook in first 0.5s. Short lines. |
| `reel` | `Shorts` | 9:16 (1080×1920) | 15–90 sec | Same as shorts. Hook + save-worthy payoff. |
| `linkedin` | `Square` | 1:1 (1080×1080) | 30–120 sec | Professional, insightful, no hype. B2B tone. |

## Pacing (used by the validator to check effort)

Approx seconds of narration per line:
- `youtube-long`: ~7s/line
- `linkedin`: ~6s/line
- `shorts` / `reel`: ~4.5s/line

So `meta.targetSeconds` implies a minimum line count. The validator fails a script that is
too short for its target (this is an anti-laziness gate).

## Format rules that matter for reach (2026)

- **Hook in the first 1–2 seconds.** First line must grab. No slow intros, no logos.
- **Captions always on** — handled automatically (karaoke captions are core to the engine).
- **Vertical (shorts/reel):** one idea per line, fast cuts, payoff that makes people save/share.
- **LinkedIn:** lead with an insight or a number; professional, no clickbait; end with a takeaway.
- **Trending audio** (shorts/reel/IG) is added manually in-app after export — it boosts reach and
  the engine leaves room for it (voiceover only, music optional).

## Multi-platform reuse

Author once (one `script.json`), render multiple compositions. A single long-form video's best
moments can be re-scripted into 3–5 vertical `shorts`/`reel` scripts for distribution.
