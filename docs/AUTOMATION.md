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
| **Channel — TIL** | `til` | **Daily (auto)** + manual | Fully autonomous. Groq invents a valuable fact; a short is built + delivered. |
| **Channel — Cohort Zero** | `cohortzero` | Manual (enter a topic) | Long video + 3 shorts. Wikipedia-grounded. |
| **Channel — Farsight** | `farsight` | Manual (enter a topic) | Long video + 3 shorts. Wikipedia-grounded. |
| **Channel — Syndar** | `syndar` | Manual (enter a topic) | Long + 3 shorts. **DRAFT — verify technical claims before uploading.** |

To make a video: Actions → the channel → **Run workflow** → (type a topic for the 3 research
channels) → Run. When it finishes, the MP4(s) + a `.txt` publish kit (title, alt titles, description,
hashtags) are committed to **`out/`**. Download from GitHub, upload to the platform.

## How each run works
1. **Grounding (anti-hallucination):** for research channels, it pulls real Wikipedia summaries for
   the topic and feeds them to the model as the factual basis (+ records them in `research.md`).
2. **Write (Groq, free):** the model writes the long `script.json` following `AGENTS.md`, the niche
   pack, and the schema — rank-fast title, varied layouts (so it looks produced, not generic), and
   Urdish/Hinglish if the channel's language is set that way.
3. **Script-aware shorts:** a second pass picks the **3 most hook-worthy, valuable moments from the
   long script** and rewrites each as a standalone reel — never a random time-cut.
4. **Render + deliver:** validate → voiceover → assets → compress → render (long + each short) →
   publish kits → committed to `out/`.

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
