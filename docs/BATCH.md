# Batch Mode & Auto-Cut

Two ways to produce many videos at once.

## Batch — "make N videos in one go"

Put one script file per video in **`theranos-doc/jobs/`** (e.g. `wework.json`, `kodak.json`),
each in the same schema as `src/data/script.json`. Optionally add `jobs/<name>.research.md`.

```bash
cd theranos-doc
npm run batch            # renders every jobs/*.json -> out/<name>_<platform>.mp4
npm run batch -- --only=wework   # just the matching one(s)
npm run batch -- --sample        # 45-frame draft of each (fast wiring check)
```

- Runs sequentially **locally** (slow on 4 cores — good for overnight).
- Your current `src/data/script.json` + `research.md` are **backed up and restored** — batching
  never disturbs what you're working on.
- A job that fails validation is logged and **skipped**; the rest still run.

### The fast way: GitHub Actions (parallel)
Push your `jobs/`, then Actions tab → **Batch Render** → **Run workflow**. It renders **every job
on its own runner in parallel** (up to 10 at once), each producing a downloadable artifact. Five
videos finish in about the time of one. Laptop can be off.

## Auto-Cut — one long video into Reels/Shorts

Turn the current long-form `src/data/script.json` into several vertical clips:

```bash
npm run autocut        # 4 reels -> jobs/reel_1.json … reel_4.json
npm run autocut 6      # 6 reels
npm run batch -- --only=reel   # render them (9:16)
```

It splits the long-form into contiguous, coherent chunks and repackages each as a `reel`
(9:16, punchy target length), keeping every line's assets and layouts. These are a strong
**mechanical baseline** — for maximum punch, have the AI rewrite each reel's opening line into a
sharper hook, then batch-render.

## Typical flow

1. Make one strong long-form video (YouTube).
2. `npm run autocut` → a week of Reels/Shorts from it.
3. Drop a few more long-form ideas into `jobs/` as their own scripts.
4. Push → **Batch Render** on GitHub → download the whole set.
