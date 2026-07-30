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
Channel/Niche: space | business        (later: ai, ...)
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
5. **Prepare.** Run `npm run prepare-video` (voiceover → assets → compress; re-checks real
   duration against the audio).
6. **Preview or render.**
   - Preview live: `npm run dev` (instant, in browser).
   - Final file: `npm run render:youtube` / `render:shorts` / `render:square`
     (map platform → composition via `docs/PLATFORMS.md`), or let GitHub Actions render it.

## The script.json contract (summary — full schema in `docs/script.schema.json`)

```jsonc
{
  "meta": {
    "title", "topic",
    "niche": "space|business|ai",
    "channel": "space|business|...",
    "platform": "youtube-long|shorts|reel|linkedin",
    "targetSeconds": 360,            // drives the anti-laziness duration gate
    "fps": 30,
    "style", "voice",                // from the niche pack
    "accentColor": "#rrggbb",        // from the niche pack
    "pauseBetweenLinesSec": 0.35,
    "description", "tags": [">= 3"],
    "researchFile": "research.md",
    "requireResearch": true
  },
  "lines": [
    { "text": "one spoken sentence",
      "keywords": ["visual search term"],
      "asset": "optional_file.jpg",  // omit to auto-fetch from keywords
      "type": "image|video",
      "layout": "lower-third|center|title",   // optional, default lower-third
      "kicker": "OPTIONAL ACT LABEL" }
  ]
}
```

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
```
Windows note: renders route temp to `D:/remotion-temp` (C: is nearly full). Only 4 CPU cores,
so full renders are slow (~90 min for a 5-min video) — prefer live preview to iterate, and
offload final renders to GitHub Actions.

## The non-laziness contract (do not violate)

- **Do the research.** Real sources in `research.md`. No hallucinated facts.
- **Hit the duration.** If the brief says 6 minutes, write enough lines for 6 minutes. The gate
  rejects short scripts — you cannot ship a 1-minute video when 6 was asked.
- **No placeholders, no duplicate lines, real visual + layout variety.**
- **Fix, don't bypass.** If a gate fails, fix the content. Never disable a check or fake a pass.
- **$0 policy:** use only free tools (edge-tts, Pexels, GitHub Actions). Do not add paid services.

## Cross-tool note

This file is the single source of truth. `CLAUDE.md`, `.github/copilot-instructions.md`, and
`.cursorrules` are thin pointers that just say "read AGENTS.md" — so any AI (Claude Code,
Copilot, Cursor, Antigravity) gets the same context.
