# PROJECT CONTEXT — read this first (for any AI agent)

This one file tells you everything about this project so you don't have to be re-briefed: what it is,
where things live, the pipelines, and how/where to commit. Pair it with **`AGENTS.md`** (the deep
detail of the video render engine).

---

## The repo (where to commit)
- **GitHub:** `https://github.com/hassankhan2510/ytautomation`
- **Git remote:** `origin` → that URL. **Branch: `main`.** There is only ONE repo — everything commits here.
- **Local path:** `D:\gen ai\personal reserch\Youtube_Automation`
- **Commit convention:** descriptive message; end commit messages with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Windows notes:** only 4 CPU cores (renders are slow — prefer previews / GitHub Actions). Renders route
  temp to `D:/remotion-temp` (C: is nearly full). LF→CRLF warnings on commit are harmless.
- Pre-existing untracked junk in the working tree (branding assets, `*.mp3`, `.zip`, `ir/`, `theranos-doc/node`)
  is NOT part of this project — never stage it. Stage only files you intentionally changed.

## What this system is
A **faceless, data-driven content factory**. You produce **DATA** (a `script.json` or a `carousel.json`),
a fixed, tested **Remotion engine** in `theranos-doc/` renders it to MP4s / image slides / PDFs, and
GitHub Actions delivers/posts it. Everything is **$0** (free tools only): Groq (LLM), Kokoro/edge-tts/
Chatterbox (voice), Pexels + Pollinations (visuals), Yahoo Finance + arXiv + GitHub (data), GitHub Actions (CI).

## Channels (`channels/config.json`)
| Channel | Niche | Notes |
|---|---|---|
| `syndar` | deeptech / AI-perception | YouTube shorts + long-form |
| `cohortzero` | business / startups | working best on YouTube; also a `cohortzero_pk` scout pool (TikTok/PK) |
| `equitier` | finance | YouTube shorts **and** the daily market-analysis reels (FB/IG) |
| `til` | facts | short punchy facts |
Equitier has a hard rule: **avoid interest/riba topics** (enforced in the scout block-list).

---

## The three subsystems

### 1) YouTube daily shorts — `*-daily-short.yml`
`scout.mjs` picks a fresh trending topic (per-channel seeds, deduped) → `generate_script.mjs` (Groq) writes
the short with a review/hook pass + live-data grounding → `batch.mjs` renders + uploads to YouTube as
**private** (human approves). Channels: equitier, cohortzero, syndar.

### 2) Equitier market-analysis reels → Instagram + Facebook — `equitier-daily-meta.yml`
Twice a day (weekdays: Gold then Bitcoin ~1h apart; weekends: a US-stock deep-dive). `analysis_reel.mjs`
pulls **real multi-timeframe market data** (`lib_market.mjs`: 1H/4H/Daily/Weekly from Yahoo) and writes an
all-chart reel with hard technical analysis + on-chart callouts + the date. Rendered with the `CandleChart`
component (candles, volume, VWAP, S/R zones, MAs, price tag). Voice = **Kokoro**. `batch.mjs` → `meta_upload.mjs`
posts the **reel + Instagram Story + chart Carousel** to the Equitier FB Page + Instagram (Meta Graph API;
host media on a GitHub Release). Toggles: `META_UPLOAD/STORY/CAROUSEL`; manual runs have a `publish=test` dropdown.

### 3) LinkedIn personal studio — `linkedin-personal.yml`
Every 2 days. `li_source.mjs` picks ONE fresh subject (a breakout GitHub repo OR a recent arXiv paper — never
mixed, deduped via `channels/li_history.json`) → `li_content.mjs` (Groq) writes an insight-hook (banned-openers
list), a POV thesis, a dual CTO/CEO breakdown, and **assigns the right diagram per point** → `li_render.mjs`
renders the `LiCarousel` (18 code-drawn diagram primitives in `LiSlides.tsx`) to a swipeable **PDF** →
`li_post.mjs` posts it as a **document to the personal profile** (`w_member_social`) with the source link in
the first comment. Manual runs default to a **safe dry-run**. Activation guide: `docs/LINKEDIN_PERSONAL.md`.

---

## Where things live
```
channels/config.json          channel configs (niche, voice, brand, links, disclaimers)
channels/history/<ch>.json     video topic dedup (committed back by the daily workflows)
channels/li_history.json       LinkedIn subject dedup
docs/                          AGENTS.md pointers, PLATFORMS, NICHES, LINKEDIN*.md, this file
theranos-doc/                  the Remotion render engine + all scripts (name is legacy)
  scripts/*.mjs, gen_voiceover.py   the pipeline (see below)
  src/Root.tsx                 composition registry: YouTube, Shorts, Square, Carousel, LiCarousel, Thumbnail
  src/compositions/            DocVideo (video), Carousel (IG/LinkedIn image slides), LiCarousel (LinkedIn diagrams), Thumbnail
  src/components/              Caption, SceneBlocks, DataBlocks, CandleChart, LiSlides (18 diagram primitives), Background, Brand, Grain
  src/data/                    script.json, timeline.json, carousel.json, li_carousel.json  (generated; DO NOT hand-edit timeline.json)
  jobs/                        per-video job files for batch
  out/                         render outputs (gitignored/transient)
.github/workflows/             all automation (see below)
```

### Key scripts (`theranos-doc/scripts/`)
- **Video:** `generate_script.mjs` (Groq auto-writer), `scout.mjs` (topic picker + dedup), `batch.mjs` (render+upload+post), `validate.mjs` (the gate — "All gates passed" = done), `gen_voiceover.py` (TTS + builds timeline.json), `fetch_assets.mjs` (Pexels + `AI_IMAGES=1` Pollinations), `make_thumbnail.mjs`, `make_carousel.mjs`, `publish_kit.mjs`, `autocut.mjs`, `yt_upload.mjs`.
- **Market reels:** `analysis_reel.mjs`, `lib_market.mjs` (multi-TF Yahoo data + indicators), `lib_live.mjs` (live prices + news), `lib_meta_caption.mjs`, `meta_upload.mjs` (FB Page + IG reel/story/carousel).
- **LinkedIn studio:** `li_source.mjs`, `li_content.mjs`, `li_render.mjs`, `li_post.mjs`, `lib_pdf.mjs`.
- **Shared:** `lib_history.mjs` (dedup), `lib_research.mjs`, `lib_description.mjs`, `lib_compress.mjs`, `lib_zip.mjs`.

### Workflows (`.github/workflows/`)
- `channel-<name>.yml` — manual full-channel runs.
- `equitier|cohortzero|syndar-daily-short.yml` — YouTube daily shorts (private upload).
- `equitier-daily-meta.yml` — market-analysis reels → FB + IG.
- `cohortzero-tiktok-daily.yml`.
- `linkedin-personal.yml` — LinkedIn personal carousel.
- `batch.yml`, `render.yml` — parallel rendering.
- Daily workflows commit `channels/history` / `channels/li_history.json` back for cross-run dedup
  (needs `permissions: contents: write`, already set).

## Secrets & variables (GitHub → Settings → Secrets and variables → Actions)
- **Secrets:** `GROQ_API_KEY`, `PEXELS_API_KEY`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN_<CHANNEL>`,
  `META_PAGE_TOKEN_<CHANNEL>`, `LI_ACCESS_TOKEN` (LinkedIn personal, ~60-day life), optional `LI_PERSON_URN`.
- **Variables:** `META_UPLOAD`/`META_STORY`/`META_CAROUSEL` (on/off), `META_PAGE_ID_<CH>`, `META_IG_USER_ID_<CH>`,
  `LI_BRAND`, `LI_HANDLE`, `LI_ACCENT`, `LI_VERSION`.
- `GITHUB_TOKEN` (auto) hosts reels on a GitHub Release so Meta can fetch them by URL.

## Common commands (run inside `theranos-doc/`)
```bash
npm run validate            # the gate for a video job
npm run batch -- --only=<channel>   # render + deliver a channel's jobs
node scripts/analysis_reel.mjs      # build a market-analysis reel (env CHANNEL/ASSET/MODE)
node scripts/li_source.mjs && node scripts/li_content.mjs && node scripts/li_render.mjs   # LinkedIn carousel -> out/li_carousel.pdf
node scripts/li_post.mjs --dry      # preview the LinkedIn caption without posting
```

## Rules of the road
- **Never hand-edit `src/data/timeline.json`** (auto-generated). Author `script.json` / `carousel.json` instead.
- A video is "done" only when `npm run validate` prints **"All gates passed"** — that check defines done, not vibes.
- Real research/data only — no hallucinated numbers. Vary layouts. Hit the requested duration.
- Outward-facing posting (YouTube public, FB/IG, LinkedIn) is gated behind explicit tokens/flags — never post
  without them being set. YouTube uploads default to **private**; LinkedIn manual runs default to **dry-run**.
