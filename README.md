# ytautomation

An AI-driven, $0 faceless-video production system for YouTube, Instagram, and LinkedIn.

You give a brief (**niche + topic + platform + duration + angle**). An AI does the research,
writes the script, and the fixed engine renders a finished video — with AI voiceover, karaoke
captions, auto-sourced visuals, and cinematic styling — in 16:9, 9:16, or 1:1.

## Start here
- **[AGENTS.md](AGENTS.md)** — the single context file every AI reads. Start here.
- **[docs/](docs/)** — schema, component catalog, platform specs, niche packs, definition-of-done.
- **[theranos-doc/](theranos-doc/)** — the Remotion render engine + pipeline scripts.

## Quick start (local)
```bash
cd theranos-doc
npm install
pip install edge-tts
# edit src/data/script.json (or have the AI write it), then:
npm run validate        # the gate — must pass
npm run prepare-video   # voiceover + assets + compress
npm run dev             # preview live, or:
npm run render:youtube  # final MP4
```

## Cloud render (laptop off)
Push to GitHub, open the **Actions** tab → **Render Video** → **Run workflow**, pick the platform,
and download the MP4 from the run's Artifacts when it finishes. See
[.github/workflows/render.yml](.github/workflows/render.yml).

## Principles
- **$0 tooling** — edge-tts (free voice), Pexels (free assets), GitHub Actions (free render).
- **Data, not code** — the AI writes `script.json`; the engine is fixed and reliable.
- **Reliability + no laziness** — `npm run validate` enforces a machine-checked Definition of Done.
