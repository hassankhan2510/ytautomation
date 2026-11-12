# Studio — motion-primitive reel engine

Instagram-first (1080×1920) Remotion engine. **Claude Code writes the motion primitives once; the
daily LLM only writes a beat sheet** (pick primitive ids + fill props), so every job renders.

```
beat sheet (JSON) → timeline (word-synced) → primitive per beat + camera rig + living backdrop
                  → energy-matched transitions → captions · grain · light leak · progress bar → MP4
```

## Render (GitHub Actions)
Actions → **Studio — Render Reel** → Run workflow. Download the MP4 from the run's artifacts.
- `job`: beat-sheet path inside `studio/` (default `src/data/job.json`, the Day 1 hero)
- `theme`: crimson (Cohort Zero) · acid · electric · paper · taxi
- `seed`: same script + new seed = a visibly different edit
- `shaders`: `off` (default, ~4 min) = CSS cuts incl. echo zoom-blur · `on` = real WebGL shader cuts (~18 min on CPU runners)

## Beat sheet
```json
{ "id": "day02", "theme": "crimson", "seed": 4, "handle": "@cohort_zero",
  "beats": [
    { "text": "What is said", "primitive": "stomp", "energy": 3, "emphasis": ["said"] },
    { "text": "...", "primitive": "terminal", "props": { "lines": ["$ npm run ship", "✓ done"] } }
  ] }
```
Optional: `audio` / `music` (files under `public/`), `words` (whisper timings → frame-exact sync),
per-beat `transition`, `hold` (seconds), `blur` (real motion blur), `props.backdrop`.

Photos: upload into `studio/public/photos/` and use `{"primitive":"photo","props":{"src":"photos/me.jpg"}}`.

## Primitives
The menu (ids, energy, props) lives in [`src/engine/registry.ts`](src/engine/registry.ts) —
`menuForLLM()` generates the editor prompt from it. Families: text (stomp, maskReveal, decode,
highlight, strike), data (counter, bars, ghGrid), ui (terminal, code, notifs, chat), layout
(list, versus), media (photo), brand (dayStamp, outro).

Local: `npm run dev` (Remotion Studio preview) · `npm run typecheck`.
