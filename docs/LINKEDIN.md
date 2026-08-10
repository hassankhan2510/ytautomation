# LinkedIn auto-posting (Company Pages)

The pipeline already builds the assets (the reel MP4 + a PDF carousel) and an SEO caption. This doc is
the one-time setup to auto-post them to a **LinkedIn Company Page**. You do the OAuth grant yourself
(it needs your login) — the code never sees your password.

## 1. What you need first

- You must be a **Super Admin** of each Company Page (Equitier, Cohort Zero, Syndar).
- A LinkedIn account to own the developer app.

## 2. Get API access (the part that takes approval)

1. Go to **developer.linkedin.com → My apps → Create app**.
2. Fill in the app, and under **Company** select your Company Page. Click **verify** — as Page admin you
   approve the app for that Page.
3. Open the app → **Products** tab and request:
   - **Share on LinkedIn** (personal posting — instant).
   - **Sign In with LinkedIn using OpenID Connect** (instant).
   - **Community Management API** ← this is the one that lets you post **as the Page**
     (`w_organization_social`, `r_organization_social`, `rw_organization_admin`). It needs a short
     application/review; approval is usually quick for a real Page you admin.
4. When Community Management API is approved, open the **Auth** tab and copy the **Client ID** and
   **Client Secret**. Add an **Authorized redirect URL** (e.g. `https://localhost:8080/callback`).

## 3. Get a token (3-legged OAuth, once)

1. In a browser, open (one line, your values):
   ```
   https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https%3A%2F%2Flocalhost%3A8080%2Fcallback&scope=w_organization_social%20r_organization_social%20rw_organization_admin
   ```
2. Approve. LinkedIn redirects to your `redirect_uri?code=XXXX`. Copy the `code`.
3. Exchange it for tokens:
   ```bash
   curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
     -d grant_type=authorization_code -d code=XXXX \
     -d redirect_uri=https://localhost:8080/callback \
     -d client_id=YOUR_CLIENT_ID -d client_secret=YOUR_CLIENT_SECRET
   ```
   You get `access_token` (valid ~60 days) and, if enabled, `refresh_token` (valid ~1 year).

## 4. Find each Page's URN

Your Page URN is `urn:li:organization:<id>`. The `<id>` is the number in your Page admin URL
(`linkedin.com/company/<id>/admin/`), or call:
```bash
curl -s "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee" \
  -H "Authorization: Bearer ACCESS_TOKEN" -H "LinkedIn-Version: 202408" -H "X-Restli-Protocol-Version: 2.0.0"
```

## 5. Add the GitHub secrets / variable

Repo → **Settings → Secrets and variables → Actions**.

**Secrets:**
- `LI_ACCESS_TOKEN` — the access token (simplest), **or** `LI_CLIENT_ID` + `LI_CLIENT_SECRET` +
  `LI_REFRESH_TOKEN` (auto-refreshes; better for a 60-day token).
- `LI_ORG_URN_EQUITIER`, `LI_ORG_URN_COHORTZERO`, `LI_ORG_URN_SYNDAR` — each Page's `urn:li:organization:<id>`.

**Variable (this is the on/off switch):**
- `LI_UPLOAD` = `1` to turn posting on. Leave unset/empty and nothing posts.
- `LI_TYPE` = `video` (default) or `document` to post the PDF carousel instead of the reel.

## 6. Test before you automate

Preview the exact caption without posting anything:
```bash
cd theranos-doc
node scripts/li_upload.mjs --channel=equitier --script=jobs/equitier_short_1.json --dry
```
Then a real single post (with the token in your shell env):
```bash
LI_ACCESS_TOKEN=... LI_ORG_URN_EQUITIER=urn:li:organization:123456 \
  node scripts/li_upload.mjs --channel=equitier --script=jobs/equitier_short_1.json \
  --video=out/equitier_short_1_reel.mp4
```
Once that works, the daily workflows post automatically whenever `LI_UPLOAD=1`.

## The caption (built for reach)

`lib_linkedin_caption.mjs` assembles: **hook line** (the title, the only line shown before "…see more")
→ keyword-rich SEO body → a comment-driving CTA → the video link → 3–5 focused hashtags (LinkedIn's own
guidance — not 30). Set the repo variable `LI_LINK_IN_COMMENT` handling via env `LI_LINK_IN_COMMENT=1`
to move the link into the first comment (LinkedIn slightly down-ranks posts with external links in the body).
