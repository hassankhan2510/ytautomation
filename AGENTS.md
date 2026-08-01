# AGENTS.md — Read This First

You are an AI operating a **faceless video production system** for YouTube, Instagram, and
LinkedIn. This one file gives you full context. Read it, then read the specific docs it points to.

## What this system is

The user gives a short brief. You turn it into a finished, high-quality video **reliably** — no
broken renders, no laziness. The trick: **you produce DATA, not rendering code.** A fixed, tested
engine (in `theranos-doc/`, name is legacy) renders that data into MP4s for any platform.

**The golden rule:** compose the documented building blocks by writing one file,
`theranos-doc/src/data/script.json`. Do NOT rewrite the engine. A video is only "done" when
`npm run validate` prints **"All gates passed"** — that check, not your judgment, defines done.

## The brief you will receive

```
Channel/Niche: space | business | ai | robotics | deeptech | finance | history | truecrime | science | psychology | geography | motivation
Topic:         <subject>
Platform:      youtube-long | shorts | reel | linkedin
Duration:      e.g. 6 min  /  60 sec
Style:         (optional; niche pack has a default)
Angle:         <the user's take / how to present it / the hook>
```
Sometimes batched: *"3 reels for Instagram on topics A, B, C."* → do the full flow once per reel.

## Your job — follow these steps every time

1. **Load context.** Read this file, then:
   - `docs/NICHES/<niche>.md` (voice, color, tone, visual bias, structure)
   - `docs/PLATFORMS.md` (aspect, length, pacing, style for the platform)
   - `docs/COMPONENT_CATALOG.md` (the scene blocks you compose)
   - `docs/DEFINITION_OF_DONE.md` (the gates you must pass)
2. **RESEARCH (mandatory).** Web-search the topic. Write real findings + **≥3 real source URLs**
   into `theranos-doc/src/data/research.md`. No research = the validator fails you.
3. **Write the script.** Create `theranos-doc/src/data/script.json` per the schema
   (`docs/script.schema.json`), the niche pack, and the platform spec. Enough lines for the
   duration (see pacing). Vary layouts, add kickers, spell numbers out for TTS.
4. **Validate.** Run `npm run validate`. Fix `script.json` until it prints "All gates passed."
   Never skip or work around a failing gate.
4b. **Write a rank-fast title.** `meta.title` = the single strongest, high-CTR, search-friendly
   title, plus 3–6 `titleOptions` and 5–12 `hashtags`. Follow `docs/TITLES.md` (keyword + curiosity +
   specificity). This is 50% of whether the video ranks.
5. **Prepare.** Run `npm run prepare-video` (voiceover → assets → compress; re-checks real duration
   against the audio). Long-form videos get a branded **intro sting**; **all** videos get an **outro
   end-card** (from `brand`/`tagline`/`accentColor` in the channel config) and are **loudness-normalized
   to −14 LUFS** after render (in `batch`). **Shorts get NO intro** (it blunts the hook). Videos carry
   **no SFX** (distracting). `batch` also emits a **LinkedIn/Instagram carousel** (`make_carousel.mjs`:
   JPEG slides + a PDF). All automatic — the script author doesn't set them.
6. **Preview or render.**
   - Preview live: `npm run dev` (instant, in browser).
   - Final file: `npm run render:youtube` / `render:shorts` / `render:square`
     (map platform → composition via `docs/PLATFORMS.md`), or let GitHub Actions render it.

## The script.json contract (summary — full schema in `docs/script.schema.json`)

```jsonc
{
  "meta": {
    "title",                          // the single BEST rank-fast, high-CTR title (see docs/TITLES.md)
    "titleOptions": ["3-6 alternative rank-fast titles to A/B pick from"],
    "hashtags": ["5-12", "post", "hashtags"],
    "topic",
    "niche": "space|business|ai",
    "channel": "space|business|...",
    "platform": "youtube-long|shorts|reel|linkedin",
    "targetSeconds": 360,            // drives the anti-laziness duration gate
    "fps": 30,
    "style", "voice",                // from the niche pack ("voice" = edge-tts voice, used for ur/hi + Edge mode)
    "kokoroVoice": "am_michael",     // Kokoro neural voice for English "Auto" mode (am_michael/am_onyx/am_fenrir/am_puck)
    "voiceRate": "+18%",             // speech speed: +18% snappy reels, +10% long-form, +0% slow
    "accentColor": "#rrggbb",        // from the niche pack
    "pauseBetweenLinesSec": 0.15,    // gap between scenes: ~0.15 reels, ~0.25 long-form
    "music": "cinematic_bed.mp3",    // OPTIONAL: calm/ambient bed in public/music/ (never club/EDM). Omit for none.
    "musicVolume": 0.14,             // low, sits under the voice
    "description", "tags": [">= 3"],
    "researchFile": "research.md",
    "requireResearch": true
  },
  "lines": [
    { "text": "one spoken sentence",         // SPOKEN (TTS); may be Hindi/Urdu
      "caption": "English on-screen text",   // optional; REQUIRED if voice is not en-*
      "keywords": ["visual search term"],
      "asset": "optional_file.jpg",           // omit to auto-fetch from keywords
      "type": "image|video",
      "layout": "lower-third|center|title|stat|quote|bullets|chart|compare|timeline|meter|nametag|map|collage",
      "kicker": "OPTIONAL LABEL",             // heading for bullets/chart; label for meter
      "stat": "$9B → $0",                     // layout: stat
      "cite": "attribution",                  // layout: quote
      "items": ["point one", "point two"],    // layout: bullets
      "chart": [{"label":"2014","value":9000}],                 // layout: chart
      "compare": {"left":{"title":"","items":[]},"right":{"title":"","items":[]}}, // layout: compare
      "events": [{"label":"2015","text":"..."}],                // layout: timeline
      "percent": 12,                          // layout: meter
      "name": "Person", "role": "Title",      // layout: nametag
      "location": "City", "coords": "0°N, 0°W",                 // layout: map
      "collageAssets": ["a.jpg","b.jpg"] }    // layout: collage (2-4 files in public/assets)
  ]
}
```
See `docs/COMPONENT_CATALOG.md` for when to use each of the 13 layouts.

**Languages (IMPORTANT — Urdu/Hindi default to code-switching):**
- Set `meta.voice` to the language voice (`ur-PK-AsadNeural`, `hi-IN-MadhurNeural`).
- When the user asks for **Urdu**, write the spoken `text` in natural **Urdish** — Urdu script with
  common English words kept in English inline (startup, company, fund, acquire, mission, technology,
  brand names, etc.). When they ask for **Hindi**, write **Hinglish** the same way. This is how real
  Desi creators talk; pure formal Urdu/Hindi sounds stiff.
- Rules: keep English words in **Latin script inline** (e.g. `Uber نے Careem کو acquire کیا`). Do NOT
  write Roman Urdu/Hindi (the neural voice needs native script). Keep years/large numbers as script
  words for reliable pronunciation. Symbols and the big figures go in the `stat`/`caption` fields, not
  the spoken text.
- On-screen text stays **English** via `caption` — the validator forces an English `caption` on every
  line when the voice isn't English, so Urdu/Hindi script never shows on screen.
- See `docs/COMPONENT_CATALOG.md` for the scene blocks.

## Where things live

| Path | What |
|---|---|
| `AGENTS.md` (this) | System context — the entry point |
| `docs/` | schema, component catalog, platform specs, niche packs, definition-of-done |
| `theranos-doc/src/data/script.json` | **The only file you edit per video** (the content) |
| `theranos-doc/src/data/research.md` | Your research + sources (required) |
| `theranos-doc/src/data/timeline.json` | Auto-generated timing — DO NOT hand-edit |
| `theranos-doc/scripts/` | validate, gen_voiceover, fetch_assets, compress |
| `theranos-doc/src/` | the render engine (compositions + components) — rarely touch |

## Commands (run inside `theranos-doc/`)

```bash
npm run validate         # the gate — must pass before anything else
npm run prepare-video    # voiceover + assets + compress (+ real-duration check)
npm run dev              # live preview in the browser (fast)
npm run render:youtube   # final 16:9 MP4   (shorts / square for other platforms)
npm run preview:youtube  # fast half-res draft render
npm run autocut          # split the current long-form into jobs/reel_*.json (Reels/Shorts)
npm run batch            # render every jobs/*.json -> out/  (parallel on GitHub Actions)
```
**Batch & Reels:** put one script per video in `jobs/`, or run `autocut` to cut a long-form into
vertical reels; then `batch` renders them all. Full guide: `docs/BATCH.md`.

**Full automation:** each channel (syndar, cohortzero, equitier, til) has its own GitHub Action that
uses **Groq (free)** to write the script + script-aware shorts, then renders and delivers to `out/`.
Locally: `CHANNEL=<name> TOPIC="..." node scripts/generate_script.mjs` then `npm run batch -- --only=<name>`.
Config in `channels/config.json`. Full guide: `docs/AUTOMATION.md`.
Windows note: renders route temp to `D:/remotion-temp` (C: is nearly full). Only 4 CPU cores,
so full renders are slow (~90 min for a 5-min video) — prefer live preview to iterate, and
offload final renders to GitHub Actions.

## The non-laziness contract (do not violate)

- **Do the research.** Real sources in `research.md`. No hallucinated facts.
- **Hit the duration.** If the brief says 6 minutes, write enough lines for 6 minutes. The gate
  rejects short scripts — you cannot ship a 1-minute video when 6 was asked.
- **No placeholders, no duplicate lines, real visual + layout variety.**
- **Fix, don't bypass.** If a gate fails, fix the content. Never disable a check or fake a pass.
- **$0 policy:** use only free tools. Voice = Kokoro (natural English, auto) / edge-tts (Urdu/Hindi) /
  Chatterbox (your cloned voice, MIT — English). Visuals = Pexels. CI = GitHub Actions. No paid services.

## Cross-tool note

This file is the single source of truth. `CLAUDE.md`, `.github/copilot-instructions.md`, and
`.cursorrules` are thin pointers that just say "read AGENTS.md" — so any AI (Claude Code,
Copilot, Cursor, Antigravity) gets the same context.
