# Playbook Studio

An autonomous machine that generates a **top-1%, ~60-page playbook / e-book** from a single topic —
real research, no hallucination, vector-native graphics, magazine-grade layout, a true vector PDF.
Fully **isolated** from the video/LinkedIn pipelines (own `package.json`, own workflow). Runs **free** on
GitHub Actions with Groq.

## The pipeline (One Spine, seven phases)

Everything lives in one file per run — `runs/<id>/book.json` (the **Spine**). Each phase reads it, fills
its slice, passes a **gate**, and checkpoints. That is what keeps a 2-hour run coherent and resumable.

| # | Phase | Script | What it does |
|---|-------|--------|--------------|
| 1 | Research | `pb_research.mjs` | Pulls **real** arXiv + Wikipedia text; the LLM only *extracts* claims from it. Every claim keeps its source URL (the evidence ledger). Derives the book thesis. |
| 2 | Architect | `pb_architect.mjs` | Builds chapters → sections **before any prose** (the Memory Graph). Each section gets a thesis, its cited evidence ids, and — **graphic-first** — the visual that proves it. |
| 3 | Write | `pb_write.mjs` | **Map-reduce:** one section per LLM call from a tight context packet. Paragraph-level sourcing. Checkpoints after every section. |
| 4 | Verify | `pb_verify.mjs` | **Citation-or-cut:** an auditor removes/corrects any claim or number not backed by the cited evidence. |
| 5 | Graphics | `pb_graphics.mjs` | **Visual Router:** evidence-grounded **vector SVG** for data/logic; AI image (Pollinations) only for atmosphere. Never a broken figure. |
| 6 | Layout | `pb_layout.mjs` | The **"Vogue" engine**: A4 HTML/CSS, Playfair + Inter, drop caps, framed figures, pull quotes, cover, contents, concept map, chapter dividers, sources ledger. |
| 7 | Render | `pb_render.mjs` | Headless Chromium → **vector PDF** with selectable text, sharp SVG, real page numbers. |

Optional: `pb_edit.mjs` — a senior-editor rubric pass that scores sections and (`--fix`) resets the weakest for a targeted rewrite.

## Reliability (how it survives free tier + 2 hours)

- **`pb_llm.mjs` — a (key × model) budget matrix.** 3 keys × N models = independent slots, each tracking
  RPM (30/min), RPD (1,000/day, **persisted to disk**), and TPM (8k/min). It picks the best slot for a
  task's quality tier, clamps tokens (no 413), rotates on 429, and never silently downgrades a "high"
  task unless the whole tier is out of daily budget.
- **Checkpoint everything.** Every phase writes the Spine after each unit; a crash/rate-limit pause just
  means the next run continues. Orchestrator retries the fillable phases automatically.
- **Gates, not vibes.** A phase fails loudly if its output is thin/uncited — like `npm run validate`.

## How it maps to the "Beast" design

- Visual Router (data vs art) → phase 5. **Vector-native (SVG), not Puppeteer-raster** → the free-tier win.
- Memory Graph / no-hallucination → the One Spine + citation-or-cut + gates.
- Groq map-reduce context engine → phase 3 + `pb_llm.mjs`.
- Vogue layout → phase 6 (**HTML/CSS → Chromium**, chosen over React-PDF/LaTeX for real CSS + native SVG).
- Deliberately **cut** (low ROI / traps): embedded-JS "living" PDFs (only work in Acrobat), per-page
  margin minimap. A full-page **concept map** is kept instead.

## Run it

```bash
cd playbook
npm install                                   # downloads a headless Chromium once
export GROQ_API_KEY=...  GROQ_API_KEY_2=...  GROQ_API_KEY_3=...
PB_TOPIC="The Future of Graph Neural Networks" node src/pb_run.mjs
# -> runs/the-future-of-graph-neural-networks/<id>.pdf
```

Useful:
```bash
node src/pb_llm.mjs --doctor                  # show detected keys/models/slots (+ live ping)
PB_ID=<id> node src/pb_run.mjs --from=graphics # resume from a phase
PB_ID=<id> node src/pb_run.mjs --only=render   # re-render only
PB_ID=<id> node src/pb_edit.mjs --fix          # editor gate + reset weak sections
```

### Config
- **Keys:** `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3` (or `GROQ_API_KEYS="k1,k2,k3"`).
- **Models:** `PB_MODELS='[{"id":"openai/gpt-oss-120b","tier":"high","tpm":8000,"rpm":30,"rpd":1000},{"id":"qwen/qwen3-32b","tier":"mid"},{"id":"openai/gpt-oss-20b","tier":"fast"}]'`
  (a sensible default pool is used if unset). `tier` decides which tasks a model is trusted with.
- **Other:** `PB_PAGES` (default 60), `PB_NO_IMAGES=1` (SVG-only), `PB_AUDIENCE`.

### CI
`.github/workflows/playbook.yml` — manual **Run workflow**, enter a topic, download the PDF artifact.
Add `GROQ_API_KEY[_2/_3]` as repo secrets; optional `PB_MODELS` as a repo variable.
