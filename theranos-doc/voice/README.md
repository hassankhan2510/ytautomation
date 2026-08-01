# Your voice (Chatterbox clone)

Drop a short recording of yourself here and the pipeline can narrate videos in **your**
voice instead of a robotic TTS. Free, MIT-licensed (Chatterbox), runs on CPU.

## How to add your voice
1. Record **10–20 seconds** of yourself reading naturally (a calm, clear paragraph — the way
   you'd narrate a video). Any phone mic is fine; quiet room, no music.
2. Export it as a **WAV** file (mono or stereo, 24 kHz+ is ideal).
3. Save it here as:
   - `voice/me.wav`  → used for every channel, **or**
   - `voice/<channel>.wav` (e.g. `voice/syndar.wav`) → a per-channel voice, takes priority.
4. Commit it (this is a public repo, so the clip is public — that's fine, it's your brand voice).

You can also point at any file with the `VOICE_REF` env var.

## How to use it
- **In GitHub Actions:** on any channel workflow, set the **Voice** dropdown to
  **"My voice (Chatterbox clone)"** and Run. (English only — Urdu/Hindi always use edge-tts.)
- **Locally (your PC):**
  ```
  npm run batch -- --only=cohortzero --voice=myvoice
  ```

## Notes
- **English only** for cloning right now. Urdu/Hindi jobs automatically fall back to edge-tts,
  even in "My voice" mode.
- Cloning is CPU-heavy: expect roughly **5–10 min per short**, **30–60 min per long-form**.
- If no clip is found (or Chatterbox fails to load), the run **falls back to edge-tts** and
  prints a NOTE — it won't crash, but it won't be your voice either.
- The default auto voice (no clip needed) is **Kokoro** for English — natural and fast.
