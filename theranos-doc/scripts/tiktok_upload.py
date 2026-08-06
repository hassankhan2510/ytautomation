#!/usr/bin/env python
"""
Best-effort TikTok upload via cookies (no official API for free public posting).

Uses `tiktok-uploader` under the hood — cookie-based Selenium automation. Fragile by nature:
- Cookies expire (~2-4 weeks). If upload fails with an auth error, refresh cookies.txt.
- TikTok flags datacenter IPs (like GitHub Actions runners). May shadowban a new account.
  For durable results, run this LOCALLY from your own machine on a schedule.
- The video is ALWAYS delivered as a workflow artifact regardless — a failed auto-upload
  just means you download the zip and post it manually.

Args:
  --video PATH        Path to the MP4 to upload.
  --description TEXT  Caption/description with hashtags.
  --cookies PATH      cookies.txt path (Netscape format). Default: theranos-doc/cookies.txt.

Env:
  TIKTOK_COOKIES      Optional cookies.txt contents (used when running in GitHub Actions).

Exit codes: 0 = uploaded, 1 = attempted and failed (non-fatal to the workflow).
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--description", required=True)
    ap.add_argument("--cookies", default="cookies.txt")
    args = ap.parse_args()

    if not os.path.exists(args.video):
        print(f"tiktok: video not found: {args.video}")
        return 1

    # If TIKTOK_COOKIES env is set (GH secret), write it out to a temp file for the uploader.
    cookies_path = args.cookies
    tmp = None
    env_cookies = os.environ.get("TIKTOK_COOKIES", "").strip()
    if env_cookies:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
        tmp.write(env_cookies)
        tmp.close()
        cookies_path = tmp.name
        print("tiktok: using cookies from TIKTOK_COOKIES env (masked).")
    elif not os.path.exists(cookies_path):
        print(f"tiktok: no cookies at {cookies_path} and TIKTOK_COOKIES env is empty — skipping upload.")
        return 1

    # Description length: TikTok caps around 2200 chars but the algorithm prefers short + hashtags.
    desc = args.description.strip()[:2100]

    try:
        # Import inside try — the lib is heavy and only needed when we actually attempt an upload.
        from tiktok_uploader.upload import upload_video  # type: ignore
    except ImportError:
        print("tiktok: `tiktok-uploader` not installed. Run: pip install tiktok-uploader")
        return 1

    print(f"tiktok: uploading {args.video} ({os.path.getsize(args.video) / 1e6:.1f} MB) ...")
    try:
        failed = upload_video(
            filename=args.video,
            description=desc,
            cookies=cookies_path,
            headless=True,
        )
        # tiktok-uploader returns a list of failed uploads (usually [] on success).
        if failed:
            print(f"tiktok: upload reported failure -> {failed}")
            return 1
        print("tiktok: ✓ uploaded")
        return 0
    except Exception as e:
        # NEVER let a TikTok failure kill the workflow — the video is already delivered as an artifact.
        print(f"tiktok: upload failed ({e}). The video is still available in the workflow artifact.")
        return 1
    finally:
        if tmp:
            try:
                os.remove(tmp.name)
            except OSError:
                pass


if __name__ == "__main__":
    sys.exit(main())
