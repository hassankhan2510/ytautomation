# Component Catalog

The engine is FIXED and tested. The AI does NOT write rendering code for normal videos — it
composes these building blocks by setting fields in `script.json`. This is why videos are reliable.

## Per-line fields you control

| Field | Values | What it does |
|---|---|---|
| `text` | one spoken sentence | What is **spoken** (TTS). May be Hindi/Urdu. Also shown on screen if no `caption`. |
| `caption` | English text (optional) | What is **shown** on screen. Use when `text` is Hindi/Urdu so on-screen text stays English. |
| `keywords` | 1–3 visual search terms | Used to auto-download the background from Pexels |
| `asset` | filename or omit | Explicit background file; omit to let keywords fetch one |
| `type` | `image` \| `video` | Image = Ken Burns pan/zoom; video = looping clip background |
| `layout` | see below | The scene style |
| `kicker` | short UPPERCASE label | Optional label above the text (also the heading for a `bullets` scene) |
| `stat` | e.g. `"$9B → $0"` | For `layout: stat` — the big figure to display |
| `cite` | short string | For `layout: quote` — the attribution line |
| `items` | array of 2–5 strings | For `layout: bullets` — the list items |

## Layouts

- **`lower-third`** (default, ~80% of lines): caption card in the lower-left with the accent edge
  and karaoke word highlight. The workhorse.
- **`center`**: bold centered card. Use for your strongest 4–8 statements — the hook, the thesis,
  big reveals, the closing line. Handles longer text well.
- **`title`**: huge centered hero text, no box, growing underline. ONLY for very short lines
  (≤5 words) — an opening title or an act name. Long text gets auto-shrunk and looks weak.
- **`stat`**: a huge hero figure (`stat` field) with a label under it. For big numbers/reveals
  ("$9B → $0", "400 million users"). Great for business/finance/space scale.
- **`quote`**: an elegant serif pull-quote of `text` with an attribution line (`cite`). For
  a powerful quotation or a thesis statement.
- **`bullets`**: a list (`items`) that reveals one point at a time, with an optional heading
  (`kicker`). For "3 reasons", "the 5 signs", comparisons — very strong on Reels/Shorts.

## Languages (Hindi / Urdu voice, English on screen)

Set `meta.voice` to any Edge voice (e.g. `ur-PK-AsadNeural`, `hi-IN-MadhurNeural`). Then per line,
put the **spoken** words in `text` (that language's script) and the **English on-screen** words in
`caption`. The validator REQUIRES an English `caption` on every line whenever the voice isn't
English, so Hindi/Urdu text can never accidentally appear on screen.

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
