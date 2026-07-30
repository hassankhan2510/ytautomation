# Background Music

Music is **optional** and **off by default**. A video with no music still works perfectly
(voice + captions + visuals). Turn it on per video by setting `meta.music`.

## How to enable

1. Put a track in **`theranos-doc/public/music/`** (e.g. `cinematic_bed.mp3`).
2. In `script.json` meta:
   ```json
   "music": "cinematic_bed.mp3",
   "musicVolume": 0.14
   ```
3. Run `npm run prepare-video` then render. The engine mixes it as a low-volume loop under the
   narration. If the file isn't found, it simply renders with no music (never crashes).

`musicVolume` stays low on purpose (~0.10–0.18) so it sits *under* the voice, not over it.

## What kind of music to use (content rule)

Use **calm, cinematic / ambient / documentary-style** beds — the kind that sit quietly under a
narrator. **Do NOT use club / EDM / party / heavy-beat "dance" music.**

Good fits by niche:
- **Space** → ambient, atmospheric pads, slow cinematic swells, soft piano/strings.
- **Business** → subtle documentary tension, minimal piano, low drones — no heavy drops.

If you prefer a **stricter approach**, two fully valid options are supported the same way:
- **Vocal / percussion-only** tracks (e.g. nasheed-style, no instruments or only duff) — just drop
  the file in `public/music/` and set `meta.music`.
- **No music at all** — omit `meta.music`. Many top documentary/faceless channels use only voice +
  subtle sound; it still sounds professional.

## Free, monetization-safe sources ($0)

- **YouTube Audio Library** (studio.youtube.com → Audio Library) — safest; cleared for monetization.
  Filter by mood "Calm/Cinematic/Ambient" and genre, avoid "Dance & Electronic".
- **Pixabay Music** — royalty-free, no attribution.
- **Free Music Archive** / **Incompetech** — royalty-free (some need attribution; check the track).

Download once, drop in `public/music/`, reuse across videos (e.g. one bed per niche).

## Licensing note

Only use tracks cleared for commercial/monetized use. YouTube Audio Library and Pixabay Music are
safe defaults. Avoid copyrighted/commercial songs — they cause takedowns and demonetization.
