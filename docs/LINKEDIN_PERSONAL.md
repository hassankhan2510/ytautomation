# LinkedIn Personal Studio — Activation Guide

This guide turns on the automation that posts a **code-drawn carousel** to **your personal LinkedIn
profile** every 2 days — a fresh repo or paper, an insight hook, your POV, real diagrams, and the
source link in the first comment. Fully hands-off once set up.

You only do this setup **once**. Take it slow — each step tells you exactly what to click and copy.

---

## What you need before starting
- A LinkedIn account (your personal one — the one you want to post from).
- Access to your GitHub repo settings (`github.com/hassankhan2510/ytautomation`).
- Your `GROQ_API_KEY` is already a GitHub secret (it powers the writing). If not, add it the same way as Step 3.

---

## Step 1 — Create / open your LinkedIn app

1. Go to **https://developer.linkedin.com/** and sign in with your LinkedIn account.
2. Top menu → **My apps** → you can **reuse an existing app** or click **Create app**.
   - If creating: give it a name (e.g. "Personal Studio"), pick a LinkedIn **Page** to associate (any page you admin — it doesn't affect personal posting), tick the legal box, **Create app**.
3. Open the app. You'll see tabs: **Settings · Auth · Products**.

## Step 2 — Add the two products (this unlocks personal posting)

1. Click the **Products** tab.
2. Find **"Sign In with LinkedIn using OpenID Connect"** → click **Request access / Add**. It should say **Added** almost instantly.
3. Find **"Share on LinkedIn"** → click **Request access / Add**. Again, **Added** instantly.
   - "Share on LinkedIn" is what gives permission to post as you (`w_member_social`). It's self-serve — **no long review** like the company-page one.

Wait until both show **"Added"** before continuing.

## Step 3 — Get your Access Token (the key that lets it post as you)

**The easy way — LinkedIn's token tool (recommended):**

1. Click the **Auth** tab in your app.
2. Scroll down to the section **"OAuth 2.0 tools"** → click **"Create token"** (or "Token Generator").
3. A window opens with a list of **scopes** (permissions). **Tick these three:**
   - `openid`
   - `profile`
   - `w_member_social`
4. Click **Request access token** → a LinkedIn permission screen appears → click **Allow**.
5. It shows you an **Access Token** — a long string. **Copy the whole thing.** ✅

That copied string is your token. Keep it safe (it's like a password). Go to Step 4.

<details>
<summary><b>If you can't find the token tool — the manual way (fallback)</b></summary>

1. In the **Auth** tab, note your **Client ID** and **Client Secret**, and under "Authorized redirect URLs" add: `https://localhost:8080/callback` → Save.
2. Paste this in a browser (replace `YOUR_CLIENT_ID`), press Enter, and click **Allow**:
   ```
   https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https%3A%2F%2Flocalhost%3A8080%2Fcallback&scope=openid%20profile%20w_member_social
   ```
3. The browser redirects to `https://localhost:8080/callback?code=XXXXX` (the page won't load — that's fine). **Copy the `code` value** from the address bar.
4. Exchange it for the token (fill in your values):
   ```bash
   curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
     -d grant_type=authorization_code -d code=XXXXX \
     -d redirect_uri=https://localhost:8080/callback \
     -d client_id=YOUR_CLIENT_ID -d client_secret=YOUR_CLIENT_SECRET
   ```
5. The response contains `"access_token": "..."` — that's your token.
</details>

## Step 4 — Add the token + your brand to GitHub

Open your repo → **Settings** → left menu **Secrets and variables** → **Actions**.

**A) Add the token as a SECRET** (secrets are hidden — the right place for a token):
1. Click the **Secrets** tab → **New repository secret**.
2. Name: `LI_ACCESS_TOKEN`
3. Value: paste the token you copied in Step 3.
4. **Add secret**.

**B) Add your brand as VARIABLES** (variables are plain text — fine for these):
1. Click the **Variables** tab → **New repository variable**. Add these three (one at a time):

| Name | Value (example) | What it is |
|---|---|---|
| `LI_BRAND` | `HASSAN KHAN` | your name shown on every slide |
| `LI_HANDLE` | `Building Syndar & Equitier` | your tagline in the footer |
| `LI_ACCENT` | `#4f8cff` | the highlight color (any hex code) |

That's all the setup. (You do **not** need to set your person ID — it's read automatically from the token.)

## Step 5 — Test it first (nothing gets posted)

1. Repo → **Actions** tab.
2. In the left list, click **"LinkedIn — Personal Studio (carousel, every 2 days)"**.
3. Top-right → **Run workflow**. Leave **kind = auto**, **publish = test** → click the green **Run workflow**.
4. Wait a few minutes. When it finishes (green ✓), click the run → scroll to **Artifacts** → download **`linkedin-carousel-run…`**.
5. Open the PDF inside. Check the slides look right. **Nothing was posted** — `test` only builds it.

## Step 6 — Go live

Once you're happy with the test PDF:
- **You don't need to do anything else.** The workflow runs **automatically every 2 days** and, because `LI_ACCESS_TOKEN` is set, it **publishes** on those scheduled runs.
- To post one **right now**: **Run workflow** again, but set **publish = publish**.

That's it. It picks a fresh subject, writes it in your voice, draws the diagrams, and posts to your profile with the source in the first comment — on its own.

---

## How it behaves (good to know)
- **Never repeats:** every posted subject is saved in `channels/li_history.json`; it won't pick the same repo/paper twice.
- **One subject per post:** a repo *or* a paper, never mixed. It alternates them.
- **Fresh only:** repos are from the last ~2 weeks (real breakouts), not old high-star repos.
- **Safe by default:** manual runs default to **test**; scheduled runs publish. If the token is missing, it just skips posting (no error).

## Troubleshooting
- **Nothing posted on a scheduled run** → check `LI_ACCESS_TOKEN` is set (Step 4A) and not expired (see below).
- **The post step says "skipped"** → the token isn't set, or you ran with `publish = test`.
- **Want to see the caption without posting** → run with `publish = test` and read the workflow log (it prints the caption + first comment).

## Important: token expiry (~60 days)
LinkedIn personal access tokens last about **60 days**, then stop working. When posts stop, just **redo Step 3** (generate a new token) and **update the `LI_ACCESS_TOKEN` secret** (Step 4A). 

> Want it truly hands-off forever? Ask me to add **auto-refresh** — that needs your Client ID + Secret + a refresh token, and then it renews itself. Say the word and I'll wire it.

## First-post note
Posting a **document (PDF)** to a personal profile via the API is the intended path, but your **first real
publish is the true test**. If LinkedIn rejects it, tell me — I'll switch it to a **multi-image swipe post**
(the slides as separate images), which is guaranteed to work for personal profiles.
