# Cohort Zero — TikTok Pakistan (daily auto, founder audience)

Same core brand (entrepreneurship / founders), but **Pakistan-flavoured** and **TikTok-targeted** —
Pakistani startup stories, founder lessons, and the "kaise entrepreneur ban-un?" hooks the local
audience actively searches for. Goal: build your name in the PK founder community so you can run
sessions/mentorship later.

## The strategy in one paragraph
The scout uses a separate `cohortzero_pk` seed pool (Careem, Airlift, Bazaar, Bykea, SadaPay, "start
business in pakistan", "young entrepreneur pakistan", etc). One 9:16 short per day at **~20:30 PKT**
(peak evening TikTok scroll). The upload is **attempted** via cookie-based automation; the video is
also **always** delivered as a workflow artifact so if the auto-post fails, you download and post it
manually in a few taps.

## ⚠️ Honest realities of "free" TikTok automation
- **No official free upload API.** The only free path is cookie-based Selenium (`tiktok-uploader`) —
  fragile and against TikTok's ToS. Use with awareness.
- **Datacenter IPs (like GitHub Actions) get flagged.** TikTok's algorithm is aggressive on new
  accounts uploading from US datacenters. Expect **reduced reach or shadowban risk**. For durable
  results, run the poster **locally** on a schedule from your own PC.
- **Cookies expire (~2–4 weeks).** When the upload step starts failing with auth errors, refresh
  cookies (see below).
- **Never publish cookies to git.** `cookies.txt` is gitignored — it lives ONLY as a GitHub secret.

## One-time setup
### 1) Grab your TikTok cookies (Netscape format)
- Log into TikTok as the Cohort Zero account in Chrome.
- Install the **"Get cookies.txt LOCALLY"** browser extension (Chrome/Edge).
- On `tiktok.com`, click the extension → **Export** → save as `cookies.txt`.

### 2) Add it as a GitHub secret (NOT a file in the repo)
- Repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: **`TIKTOK_COOKIES_COHORTZERO`**
- Value: **paste the entire contents** of `cookies.txt` (including the `# Netscape HTTP Cookie File` header).

### 3) Verify — do a manual test run first
- Actions → **"Cohort Zero — TikTok Pakistan Daily"** → **Run workflow** → leave topic blank → Run.
- When done, check TikTok for the draft/uploaded video. If the upload step logs an auth error,
  refresh your cookies (step 1) and update the secret.

## What gets posted
Every day, one Pakistan-founder short with:
- **Hook** relevant to a searched PK founder topic (from the scout).
- **Your cloned voice.**
- **Hashtags optimised for PK founder reach**: `#entrepreneur #startup #pakistan #foundersjourney
  #businessmindset #karachi #lahore #islamabad #pakistanistartup #foundermindset #foryou #fyp`
- **Caption**: the AI-written title (short + punchy) + hashtags — TikTok's algorithm favours short
  captions with a clear hook.

## The manual switch
Any run: dropdown **"Attempt TikTok upload?"** → set to **No** if you just want the video + kit for
manual posting that day. The artifact is always produced regardless.

## When cookies expire (you'll notice reach drop or upload errors)
Just re-do step 1 → update the `TIKTOK_COOKIES_COHORTZERO` secret with the fresh contents. Nothing
else changes.

## If TikTok ever restricts the account
Stop the daily. Post manually for a few weeks (still using the artifact zips). This is the honest
path — automated TikTok posting on any new account carries real risk that no code can remove.

## Quick reference
- Config seeds: `theranos-doc/scripts/scout.mjs` → `cohortzero_pk`
- Uploader: `theranos-doc/scripts/tiktok_upload.py` (uses `tiktok-uploader`)
- Workflow: `.github/workflows/cohortzero-tiktok-daily.yml`
- Cookies secret: `TIKTOK_COOKIES_COHORTZERO`
