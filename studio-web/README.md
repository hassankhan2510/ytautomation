# Studio — web page (phone-first)

Upload photos / clips (with a description each), an optional voiceover and your script → press
**Make video** → the reel appears in **My videos** (Watch · Save video · Caption). The video itself is made by
the GitHub workflow **"Studio — Make from Web"** (same engine as "Make from Project").

```
phone ─ page (Vercel) ─┬─ uploads ──────────────▶ Vercel Blob (private, deleted after the video is made)
                       └─ Make ─ /api/make ─────▶ GitHub workflow studio-web.yml ─▶ reel on the "reels" release
```

## One-time setup (≈10 minutes, free)

1. **Vercel account** — vercel.com → *Sign up with GitHub* (free Hobby plan; fine for personal use).
2. **Import the project** — *Add New → Project* → pick `ytautomation` → **Root Directory: `studio-web`** →
   Framework preset **Other** → *Deploy*.
3. **File storage** — in the project: *Storage → Create → Blob* → choose **Private** if it asks → connect it to
   this project (this adds `BLOB_READ_WRITE_TOKEN` automatically). If your store is **Public**, also add the
   variable `BLOB_ACCESS` = `public`.
4. **GitHub token** — github.com → *Settings → Developer settings → Personal access tokens → Fine-grained
   tokens → Generate*:
   - Repository access: **Only select repositories → ytautomation**
   - Permissions: **Actions: Read and write**, **Contents: Read-only**
   - Expiry: e.g. 90 days (make a new one when it expires)
   Copy it — **paste it only into Vercel**, never into chat or code.
5. **Vercel variables** — *Project → Settings → Environment Variables*:
   | name | value |
   |---|---|
   | `STUDIO_PASSWORD` | a password you choose for the page |
   | `GITHUB_TOKEN` | the token from step 4 |
   | `GITHUB_REPO` | `hassankhan2510/ytautomation` |
   Then *Deployments → ⋯ → Redeploy*.
6. Open the Vercel URL on your phone → enter the password → browser menu → **Add to Home Screen**.

If something is missing, the page shows a yellow "Setup needed" box naming it.

## Notes
- Uploads are deleted from Blob automatically once the video is ready (keeps you inside the free limit).
  A failed project's uploads are kept 1 day so you can retry.
- Videos are made on GitHub's free runners: ~15-40 min (Urdu cloned voice: longer). You can close the page.
- The finished MP4 is on the repo's public `reels` release (same as before) — anyone with the link can watch it.
- Local preview with fake data: `node studio-web/dev/mock-server.mjs` → http://localhost:8790/?mock
- `.github/workflows/studio-web.yml` is GENERATED from `studio-project.yml` by
  `python studio/scripts/make_web_workflow.py` — edit the project workflow, then regenerate.
