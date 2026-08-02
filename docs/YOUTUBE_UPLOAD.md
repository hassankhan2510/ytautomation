# YouTube auto-upload — setup (per channel)

The uploader is **already built and running**. This guide is the one-time **Google setup you do per
channel** to let it upload to that channel. Do it once per channel (~30–45 min).

**How uploads behave (already wired):**
- Every rendered video uploads as **Private** → you review in YouTube Studio → flip to Public/Schedule.
- **Long videos** also get their **custom thumbnail set automatically**. **Shorts** need no thumbnail.
- Description (SEO body + chapters + your links + disclaimer + hashtags) and tags are filled in from the kit.

### Status
| Channel | Upload wired? | What's needed |
|---|---|---|
| **Equitier** | ✅ **Done** — uploads Private automatically | nothing |
| Syndar | ⬜ | token secret → I enable it (stays **Private/DRAFT**, never auto-public) |
| Cohort Zero | ⬜ | token secret → I enable it |
| TIL | ⬜ | token secret → I enable it |

> **Where to start:** pick ONE channel you've created pages for. Below, replace `<CHANNEL>` with its
> name in lowercase (`syndar`, `cohortzero`, `til`). Equitier is already done — use it as the example.

---

## 1. Create a Google Cloud project
1. Go to **https://console.cloud.google.com** — sign in with the Google account that **owns the channel** (`@<CHANNEL>`).
2. Project dropdown (top bar) → **New Project** → name it e.g. `yt-automation` → **Create** → select it.
   *(You can reuse ONE project for all channels — you don't need a new project per channel.)*

## 2. Enable the API
3. **APIs & Services → Library** → search **"YouTube Data API v3"** → **Enable**.

## 3. OAuth consent screen (do this once per project)
4. **APIs & Services → OAuth consent screen** (newer console: **Google Auth Platform**).
   - User type **External** → Create → app name + your support/developer emails → save.
   - **Do NOT upload a logo** (a logo forces Google verification — leave it blank).
   - **Data Access → Add scopes** → add `https://www.googleapis.com/auth/youtube.upload` → Update → Save.
5. **Audience → Publish app → Confirm** so status is **"In production"**.
   - ⚠️ If left in **Testing**, the refresh token **dies every 7 days** and the automation breaks. In production it doesn't expire.
   - You do NOT need verification for your own channels — at sign-in you'll see an "unverified app" warning → **Advanced → Go to … (unsafe)**. Normal.

## 4. Create the OAuth client (once per project)
6. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type **Desktop app** → Create.
   - **Download JSON** → save it as `theranos-doc/client_secret.json` (gitignored — never commit it).

## 5. Get the channel's refresh token (one command, per channel)
7. In a terminal:
   ```bash
   cd theranos-doc && node scripts/yt_auth.mjs
   ```
   - Browser opens → **choose the account/brand that owns `@<CHANNEL>`** (if it's a Brand Account, pick that one, not your personal account).
   - Allow → click through the "unverified app" warning.
   - It prints a **refresh token** (`1//0…`). Copy it.

## 6. Add the GitHub secrets
8. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `YT_CLIENT_ID` — from `client_secret.json` *(shared across channels — add once)*
   - `YT_CLIENT_SECRET` — from `client_secret.json` *(shared — add once)*
   - `YT_REFRESH_TOKEN_<CHANNEL>` — the token from step 7 *(one per channel, e.g. `YT_REFRESH_TOKEN_SYNDAR`)*

## 7. Enable it
9. **Equitier:** already on — nothing to do.
   **Other channels:** ping me and I'll flip on `UPLOAD` in that channel's workflow. (Syndar stays
   **Private/DRAFT** — never auto-public — per `docs/SYNDAR_SETUP.md`.)

---

### Notes
- **Repeat only steps 5–6 per additional channel** — the project, API, consent screen, and client
  (steps 1–4) are shared; you just get a new refresh token and add `YT_REFRESH_TOKEN_<CHANNEL>`.
- **Quota:** ~6 uploads/day per project (each upload = 1,600 of 10,000 daily units). Fine for
  1–2/day per channel. If you scale up a lot, request a quota increase from Google.
- **Custom thumbnails** require the channel to be eligible (usually just phone verification). If not
  eligible yet, the long video keeps an auto frame and logs `! thumbnail not set` — harmless.
