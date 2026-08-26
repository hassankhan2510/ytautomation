# Whiteboard Explainer — 2.5D "living ink" spike

An **isolated** experiment (its own Remotion install; touches nothing in the main pipeline). It renders
a premium explainer where each icon **draws itself on**, then **fills with an accent gradient and lifts
off the page** (soft shadow + spring pop + parallax camera) — a step beyond flat 2D whiteboard.

## How it works (data → engine, same philosophy as the main system)
1. **`src/primitives.ts`** — 30 tagged, draw-on-friendly SVG icons (outline + optional fill region).
2. **`scripts/gen_scenes.mjs`** — one Groq call (reuses the main `lib_groq` qwen client) writes a punchy
   script and picks 1–2 matching primitives per line → `src/data/scenes.json`.
3. **`scripts/voice.py`** — Kokoro narrates each line, concatenates one track, and syncs every scene's
   frame timing. Fully optional/fallback-safe (renders silent if Kokoro is absent).
4. **`src/WhiteboardVideo.tsx`** — pans an infinite canvas across the scenes, drawing + filling the
   primitives in sync with the voice.

## Run it
```bash
cd whiteboard
npm install
npm run dev                      # live preview in Remotion Studio (uses the sample scenes.json)
# full pipeline:
TOPIC="Why most startups die" GROQ_API_KEY=... npm run scenes   # AI writes scenes + picks icons
npm run voice                    # Kokoro narration + timing  (pip install kokoro soundfile numpy)
npm run render                   # -> out/whiteboard.mp4
```
Or run the **"Whiteboard — Explainer Demo (render)"** GitHub Action (optional `topic`) and download the
MP4 artifact.

## Design notes
- CPU-only, $0 (SVG + Remotion + free Groq + free Kokoro).
- Accent/brand are data (`scenes.json`) — retarget to Equitier/Syndar by changing the palette + topic.
- To scale: add more entries to `src/primitives.ts` (keep them single-ish outline paths so the draw-on
  looks clean) and their `tags` in `scripts/gen_scenes.mjs`'s `CATALOG`.
- Next steps if it proves out: richer icons, a "hand" cursor that follows the stroke, true 3D layers.
