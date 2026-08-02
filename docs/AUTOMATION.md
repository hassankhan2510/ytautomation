# Full Automation (key in → videos out)

Each channel has its **own GitHub Action** that writes, renders, and delivers videos — you just
click Run (or, for TIL, it runs itself daily). Finished videos + publish kits land in `out/`.

## One-time setup
1. Get a **free Groq API key** → https://console.groq.com/keys
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**
   - `GROQ_API_KEY` = your Groq key (writes the scripts)
   - `PEXELS_API_KEY` = your Pexels key (fetches visuals) — you already added this
3. Done. The channels are ready.

## The 4 channels (Actions tab)

| Workflow | Channel | Trigger | Notes |
|---|---|---|---|
| **Equitier — Daily Short** | `equitier` | **Daily (auto)** — 08:00 PKT | Fully autonomous mass-upload: the **topic scout** picks a trending finance topic (YouTube autocomplete + Google Trends, interest/riba filtered) and builds ONE short + kit. Blank topic on manual run = auto-pick. |
| **Channel — Equitier** | `equitier` | Manual (enter topics) | Long video + shorts. Wikipedia-grounded. |
| **Channel — Cohort Zero** | `cohortzero` | Manual (enter topics) | Long video + shorts. Wikipedia-grounded. |
| **Channel — Syndar** | `syndar` | Manual (enter topics) | Long + shorts. **DRAFT — verify technical claims before uploading.** |
| **Channel — TIL** | `til` | Manual (auto-run OFF) | Groq invents a fact → a short. Daily schedule is disabled until TIL is fully set up. |

To make a video: Actions → the channel → **Run workflow** → fill in the fields → Run. When it
finishes, each video is delivered as a **single `.zip`** in that channel's own folder — **`out/syndar/`,
`out/cohortzero/`, `out/equitier/`, `out/til/`**. Each zip bundles everything for that one video:
the **reel/MP4**, the **`.txt` publish kit** (title, alt titles, description, hashtags), the
**carousel PDF** (LinkedIn), and the **slide JPGs** (Instagram). Download the zip, unzip, upload.

### The three dropdowns / fields
- **Topics** — **one video per topic.** Enter one, or queue several by separating them with `;` —
  e.g. `Why Airlift collapsed; How Careem beat Uber; The Daraz playbook`. Each becomes its own
  video (long) or its own set of reels (shorts). Queue five before bed, wake up to five finished.
- **What to make** — `long`, `shorts`, or `long+shorts`. `shorts` writes reels **directly** (fast,
  one model call); `long+shorts` writes the long and then cuts shorts from its best moments.
- **How many shorts per topic** — 1–5 (default **1**). Controls how many reels each topic produces
  (in `shorts` mode) or how many are cut from the long (in `long+shorts`). Set it to 1 when you want
  just one short on a topic. (TIL always makes one short — no such control.)
- **Language** — English, Urdish, or Hinglish (code-switched **voice**; on-screen text stays English).
- **Voice** — how it's narrated:
  - **Auto (natural)** — **Kokoro** neural voice for English, **edge-tts** for Urdu/Hindi. Free,
    fast, fully cloud. This is the default.
  - **My voice (Chatterbox clone)** — narrates in **your** voice from a clip you add to `voice/`
    (see `theranos-doc/voice/README.md`). English only; Urdu/Hindi fall back to edge-tts. CPU-heavy
    (~5–10 min/short, ~30–60 min/long) but still runs on the free public-repo CI.
  - **Edge-tts** — the old robotic voice; fastest, kept as a fallback.

## How each run works
The writer loops over **every topic you queued**, and for each one:
1. **Grounding (anti-hallucination):** for research channels, it pulls real Wikipedia summaries for
   that topic and feeds them to the model as the factual basis (+ records them in `research.md`).
2. **Write (Groq, free):** the model writes `script.json` following `AGENTS.md`, the niche pack, and
   the schema — rank-fast title, varied layouts (so it looks produced, not generic), and
   Urdish/Hinglish if the language is set that way.
   - `long` / `long+shorts` → writes the long script.
   - `shorts` → writes the reels **directly** (no long generated first — faster, one model call).
3. **Script-aware shorts** (only in `long+shorts`): a second pass picks the **most hook-worthy,
   valuable moments from the long script** and rewrites each as a standalone reel — never a random
   time-cut.
4. **Render + deliver:** every queued job runs validate → voiceover → assets → compress → render →
   publish kit, then all MP4s + `.txt` kits are committed to `out/<channel>/`.

Multiple topics are named `<channel>_01_<slug>`, `<channel>_02_<slug>`, … so nothing collides; a
single topic keeps the plain `<channel>` name.

## Channel settings
Edit `channels/config.json` to change a channel's niche, platform, voice, language (`en`/`ur`/`hi`),
pace, number of shorts, or accent color.

## Honest limits
- **Groq is free** → occasional rate limits; the writer retries. If a run fails, just re-run.
- **Grounding reduces hallucination, but doesn't eliminate it.** For **Syndar especially**, the
  video is a *draft* — read the script/kit and verify the technical claims before you publish. Your
  startup's credibility rides on it.
- **TIL** facts are low-stakes; a quick sanity check is enough.
- Uploading is still manual (platform APIs are the friction) — a 2-minute step at your scale.
