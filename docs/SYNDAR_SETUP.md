# Syndar — setup & run guide

Syndar is your deep-tech / physical-AI channel and the **funnel to your startup**. Its currency is
**credibility, not volume** — one wrong technical claim in front of engineers/investors costs more
than 50 missed uploads. So Syndar runs as **assisted automation, human-gated**: the machine does all
the production, but **you always verify and publish**. This guide gets it live.

---

## The rules that make Syndar work (don't break these)
- ❌ **No daily auto-run** — weekly at most; quality over cadence.
- ❌ **No auto-public** — every video uploads as **Private / DRAFT**; you verify, then publish.
- ❌ **No clickbait** — no "Top 10 Scariest AI Robots". High-signal technical only.
- ✅ **Always human-verify the technical claims** before publishing (grounding reduces hallucination, it doesn't eliminate it).

---

## Step 1 — Create the channel pages
Create the three pages and grab the same handle everywhere:
- **YouTube:** `@syndar` (or closest available)
- **Instagram** and **LinkedIn** (company page)

Use the branding kit already in the repo:
- Copy: `branding/BRANDING.md` → the **SYNDAR** section (bio, About text, tagline "Perception where cameras fail", SEO tags).
- Logo: `branding/syndar-logo-brandable.svg` (open in a browser → screenshot → square avatar).
- Colors: accent `#22D3EE` on dark `#0A0A0B`.

**Then send me the handles/URLs** → I add them to `channels/config.json` so every Syndar description
auto-includes the follow links (exactly like Equitier).

## Step 2 — (When ready) OAuth for auto-upload
Only needed if you want the machine to upload the drafts for you (still Private). Follow the existing
checklist **[docs/YOUTUBE_UPLOAD.md](YOUTUBE_UPLOAD.md)** with two differences:
1. At sign-in, choose the **account/brand that owns the Syndar channel** (not Equitier).
2. Save the token as the GitHub secret **`YT_REFRESH_TOKEN_SYNDAR`** (client id/secret are shared).

Ping me once it's set → I turn on **upload-as-Private** for Syndar (one edit). Until then, you just
download the draft zip from `out/syndar/` and upload manually.

## Step 3 — Run Syndar
Actions → **"Channel — Syndar (deep tech) [VERIFY before publishing]"** → **Run workflow**:
- **Topics** — one per line or separated by `;` (e.g. `Why cameras fail in the dark; How radar sees through dust; SLAM in GPS-denied mines`). Each becomes its own video.
- **What to make** — `long` / `shorts` / `long+shorts`.
- **How many shorts per topic** — 1–5.
- **Language** — English (recommended for Syndar).
- **Voice** — Auto (Kokoro) or, for the flagship, "My voice" once you've added `voice/syndar.wav`.

Output lands in **`out/syndar/`** as **timestamped DRAFT zips** (video + kit + carousel + thumbnail),
flagged for review — old ones are never overwritten.

## Step 4 — The review gate (non-negotiable)
Before publishing any Syndar video:
1. Read the script + the `.txt` publish kit in the zip.
2. **Verify every technical claim** against the `research.md` sources (and your own knowledge).
3. Fix or cut anything shaky. Then upload/publish.

This is the one manual step that protects the startup's credibility — keep it.

---

## What I'll switch on when you're ready (just ask)
- **Upload-as-Private for Syndar** — once `YT_REFRESH_TOKEN_SYNDAR` exists (same flow as Equitier, but stays Private/DRAFT — never auto-public).
- **Scout seeds for deep-tech** — extend the topic scout with radar / sensor-fusion / SLAM / autonomy / physical-AI seeds **+ Hacker News**, so it suggests strong technical topics (you still approve — no blind auto-pick for Syndar).
- **Fact-check pass** — a second AI pass that flags any claim not supported by the research sources, right in the publish kit, so your review is fast and targeted. (Most valuable for Syndar.)

## Quick reference
- Config: `channels/config.json` → `syndar` (niche `deeptech`, accent `#22D3EE`, `review: true`, `funnel` to the startup, `makeShorts: 3`).
- Workflow: `.github/workflows/channel-syndar.yml` (manual dispatch only — no schedule).
- Branding: `branding/BRANDING.md` (SYNDAR section) + `branding/syndar-logo-brandable.svg`.
