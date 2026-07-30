# Component Catalog

The engine is FIXED and tested. The AI does NOT write rendering code for normal videos — it
composes these building blocks by setting fields in `script.json`. This is why videos are reliable.

## Per-line fields you control

| Field | Values | What it does |
|---|---|---|
| `text` | one spoken sentence | Narrated (TTS) AND shown as a karaoke caption |
| `keywords` | 1–3 visual search terms | Used to auto-download the background from Pexels |
| `asset` | filename or omit | Explicit background file; omit to let keywords fetch one |
| `type` | `image` \| `video` | Image = Ken Burns pan/zoom; video = looping clip background |
| `layout` | `lower-third` \| `center` \| `title` | The scene style (below) |
| `kicker` | short UPPERCASE label | Optional act/chapter label above the text |

## Layouts

- **`lower-third`** (default, ~80% of lines): caption card in the lower-left with the accent edge
  and karaoke word highlight. The workhorse.
- **`center`**: bold centered card. Use for your strongest 4–8 statements — the hook, the thesis,
  big reveals, the closing line. Handles longer text well.
- **`title`**: huge centered hero text, no box, growing underline. ONLY for very short lines
  (≤5 words) — an opening title or an act name. Long text gets auto-shrunk and looks weak.

## Always-on (automatic, no config)

- **Karaoke captions** — words highlight in sync with the narration.
- **Ken Burns** — slow zoom/pan on every image; alternating direction per scene.
- **Film grain + vignette** — cinematic texture (render-optimized at quarter-res).
- **Progress bar** — thin accent bar showing scene progress.
- **Per-platform aspect** — the same script renders 16:9 / 9:16 / 1:1.

## The custom-code escape hatch (advanced, rare)

For a bespoke animation the catalog can't express, a sandboxed custom scene is allowed — but it
must (a) follow the documented interface, (b) pass typecheck, and (c) fall back to a safe default
if it errors, so it can never break the whole video. Default to composing catalog blocks; reach
for custom code only for a genuine hero moment.

## Look/feel knobs (in `meta`)

- `accentColor` — the highlight/brand color (set by the niche pack).
- `voice` — Edge TTS voice id (or a cloned voice id later).
- `pauseBetweenLinesSec` — breathing room between scenes.
