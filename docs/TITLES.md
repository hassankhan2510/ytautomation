# Titles & Metadata (rank + click)

Every script's `meta` must include a **rank-fast title**, plus alternatives, an optimized
description, and hashtags. A great video with a weak title dies; the title is 50% of the job.

## `meta.title` — the single best title

Pick the ONE strongest. A rank-fast title does three things at once:
1. **Front-loads the keyword** people actually search ("Pakistan startup", "black hole", "Theranos").
2. **Opens a curiosity gap or raises stakes** — a reason to click *now*.
3. **Is specific** — a number, a name, a concrete claim beats vague.

Proven formulas (mix them):
- `How <subject> <surprising outcome>` → "How Careem Became a $3 Billion Company"
- `Why <subject> <counterintuitive claim>` → "Why Pakistan Reached the Moon Before You Noticed"
- `The <thing> That <consequence>` → "The Startup That Digitized Pakistan's Corner Shops"
- `<Number> <things> about <topic>` → "5 Pakistani Startups Quietly Going Global"
- `<Subject>: The <hook noun>` → "SUPARCO: Pakistan's Secret Space Race"

Rules:
- **YouTube long-form:** keep the essential words in the first ~50–60 characters (they truncate).
- **Shorts / Reels:** shorter, punchier, curiosity-first. A strong hook > keywords here.
- No ALL-CAPS spam, no fake clickbait you don't deliver — the video must pay it off (retention
  is what actually ranks you).

## `meta.titleOptions` — 3–6 alternatives

Give a spread: one keyword-led (for search), one curiosity-led (for browse/suggested), one
number/list, one bold-claim. This lets you A/B pick or swap if one underperforms.

## `meta.description`

- **First line = the hook + the main keyword** (this is what shows in search/feed).
- 2–3 sentences of what the viewer gets, naturally including related keywords.
- End with a soft CTA where it fits ("Follow for more.").

## `meta.hashtags`

5–12 relevant tags: mix broad (#space, #startup) + specific (#icubeqamar, #pakistanstartups) +
platform (#shorts, #reels). These + `meta.tags` feed the publish kit.

## Output
`npm run kit` (and the render workflow) writes a **publish kit** text file next to the video with
the best title, the alternatives, the description, and the hashtags — ready to copy-paste when you
upload.
