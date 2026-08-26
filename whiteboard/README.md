# Whiteboard Explainer — 2.5D "living ink" spike

Isolated proof-of-concept for an animated explainer format that stands apart from footage reels.
**Self-contained** — its own Remotion install; it does **not** touch the main `theranos-doc` pipeline.

## The look (why it's different)
Not flat whiteboard. Each icon **draws on** (hand-sketch stroke) then its fill **lifts off the page**
— gradient + drop-shadow + a spring pop + a gentle float — over a premium paper canvas with a
parallax dot-grid and a smooth panning "infinite canvas" camera. That depth is the "2.5D" edge.

## Pieces
- `src/primitives.ts` — 30 tagged, draw-on-friendly icons (each: outline that draws + optional fill).
- `src/Sketch.tsx` — the 2.5D renderer (draw → fill-lift → float).
- `src/WhiteboardVideo.tsx` — panning canvas, per-scene layout, captions, per-scene voiceover.
- `src/data/scenes.json` — the storyboard (text + chosen primitive ids + timing). Ships with a real
  Cohort Zero sample so you can render immediately (silent).
- `scripts/gen_scenes.mjs` — ONE Groq call (reuses the main pipeline's qwen client) that writes the
  script AND picks primitives per scene from the catalog.
- `scripts/voice.py` — Kokoro voiceover per scene + real timing (falls back to estimated timing).

## Run it

**Fastest (see the visual now, silent):**
```bash
cd whiteboard && npm install && npm run dev      # Remotion Studio, or:
npm run render                                    # -> out/whiteboard.mp4
```

**Full pipeline (AI script + voice) for a topic:**
```bash
cd whiteboard && npm install
TOPIC="why most startups fail" GROQ_API_KEY=xxx node scripts/gen_scenes.mjs
python scripts/voice.py           # pip install kokoro soundfile edge-tts
npm run render
```

**Or on GitHub Actions:** run the **"Whiteboard Explainer — Demo Render"** workflow (`sample` or
`generate`) and download the MP4 from the run's artifacts. No machine setup, nothing gets posted.

## Add a primitive
Add an entry to `src/primitives.ts` (`draw` outline + optional closed `fill` + `tags`), and mirror its
`id: tags` in the `CATALOG` map in `scripts/gen_scenes.mjs` so the AI can pick it. Keep icons to a
single outline path so the draw-on reads cleanly.
