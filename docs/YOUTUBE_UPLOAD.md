# YouTube auto-upload — one-time setup checklist

Do this **once** (≈30–45 min). After it, GitHub Actions can upload to your channel automatically.
Start with **Equitier** (your set-up channel). Repeat per channel later.

> Uploads will go up as **Private** first (you flip them Public after a glance) — safest for automated
> content and avoids YouTube's "reused/inauthentic content" risk until you trust the quality.

---

## 1. Create a Google Cloud project
1. Go to **https://console.cloud.google.com** (sign in with the Google account that **owns the @equitier channel**).
2. Top bar → project dropdown → **New Project** → name it `yt-automation` → **Create** → select it.

## 2. Enable the API
3. **APIs & Services → Library** → search **"YouTube Data API v3"** → **Enable**.

## 3. OAuth consent screen (the important bit)
4. **APIs & Services → OAuth consent screen** (newer console: **Google Auth Platform**).
   - User type: **External** → Create.
   - App name (e.g. `Equitier Uploader`), your email for support + developer contact → Save & continue.
   - **Scopes** → Add scope → paste `https://www.googleapis.com/auth/youtube.upload` → Update → Save & continue.
   - Finish.
5. **Publish the app** — on the OAuth consent screen, **Publishing status → Publish app → Confirm** so it's **"In production"**.
   - ⚠️ This is the step everyone misses. If you leave it in **Testing**, your refresh token **dies every 7 days** and the automation breaks. In production it doesn't expire.
   - You do **not** need Google verification for your own use. During sign-in you'll see an "unverified app" warning → click **Advanced → Go to … (unsafe)**. That's normal and fine for your own account.

## 4. Create the OAuth client
6. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Desktop app** → Create.
   - **Download JSON** → save it as `client_secret.json` in the `theranos-doc/` folder (it's gitignored — never commit it).

## 5. Get your refresh token (one command)
7. In a terminal:
   ```bash
   cd theranos-doc && node scripts/yt_auth.mjs
   ```
   - Your browser opens → **sign in with the account that owns @equitier** → allow.
   - (If @equitier is a **Brand Account**, pick that channel when prompted.)
   - The script prints a **REFRESH TOKEN** — copy it.

## 6. Add the GitHub secrets
8. Repo → **Settings → Secrets and variables → Actions → New repository secret** (add all three):
   - `YT_CLIENT_ID` — from `client_secret.json`
   - `YT_CLIENT_SECRET` — from `client_secret.json`
   - `YT_REFRESH_TOKEN_EQUITIER` — the token from step 7

## 7. Tell me → I wire the uploader
9. Once the three secrets exist, ping me. I'll add an **upload step** to the Equitier Daily Short
   workflow that publishes the rendered short (title/description/tags from the kit, `#Shorts`) as
   **Private**. You review in YouTube Studio and flip to Public (or we go full-auto once you trust it).

---

### Notes
- **Shorts need no special API** — we upload the vertical ≤3-min video and YouTube auto-detects it as a Short.
- **Quota:** default ≈ **6 uploads/day** per project (each upload = 1,600 of 10,000 daily units). Fine for
  1 short/day. For more volume later, request a quota increase from Google.
- **Per channel:** each channel = its own refresh token (`YT_REFRESH_TOKEN_<CHANNEL>`). Client ID/secret can be shared.
