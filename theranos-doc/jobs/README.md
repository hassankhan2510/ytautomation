# jobs/

The **batch queue**. Each `jobs/<name>.json` is a full video script (same schema as
`src/data/script.json`). Optionally add `jobs/<name>.research.md` for its sources.

- **Batch render all of them:** `npm run batch` (sequential locally; parallel on GitHub Actions).
- **Auto-cut a long-form into reels:** `npm run autocut` writes `reel_1.json`… here for you.

Output lands in `out/<name>_<platform>.mp4`. Your current `src/data/script.json` is backed up
and restored automatically, so batching never disturbs what you're working on.

Filenames become the output names, so keep them short and unique (e.g. `wework.json`,
`kodak.json`, `reel_1.json`).
