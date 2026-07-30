# Definition of Done (machine-checked)

"Done" is NOT a judgment call. It is defined by `scripts/validate.mjs`, which runs before any
render. If it fails, the pipeline stops and the AI must fix the script and re-run. This is how
the system stays reliable and how the AI is prevented from being lazy.

## Reliability gates (script won't break the render)

- **meta complete** — all required meta fields present.
- **platform valid** — one of `youtube-long`, `shorts`, `reel`, `linkedin`.
- **accentColor valid** — `#rrggbb`.
- **tags ≥ 3**.
- **lines present** and **every line complete** — each has non-empty `text`, ≥1 `keywords`, and a
  valid `type`/`layout`.

## Anti-laziness gates (the AI actually did the work)

- **duration effort** — enough lines for `meta.targetSeconds` at the platform's pace. A 6-min
  video with 5 lines FAILS. (Later, `gen_voiceover.py` re-checks against the REAL audio length.)
- **no placeholders** — bans `TODO`, `TBD`, `lorem ipsum`, `placeholder`, `insert … here`, etc.
- **no duplicate lines** — every line must be unique.
- **visual variety** — enough distinct backgrounds (no single image for the whole video).
- **layout variety** (videos ≥ 6 lines) — must use at least one `center`/`title` AND one `kicker`.
- **hook line** — the first line is 3–32 words (a real hook, not empty, not a paragraph).
- **research present + sources** — `meta.researchFile` must exist and contain ≥3 real source URLs.
  This is what stops hallucinated scripts.

## Warnings (don't fail, but fix if easy)

- **TTS safety** — flags `$ % & #` and 5+ digit runs in narration; spell them out
  ("nine billion", not "$9B") so the voice reads them correctly.

## The rule

> If `npm run validate` does not print **"All gates passed"**, the video is NOT done.
> Do not proceed to voiceover/assets/render. Fix `script.json` (or do the missing research)
> and run again until green.
