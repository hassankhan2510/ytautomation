#!/usr/bin/env bash
# PHONE DELIVERY — GitHub "artifacts" are zips that need a login and don't open on a phone.
# So every finished reel is also attached as a plain .mp4 (+ caption .txt) to ONE rolling GitHub
# Release called "reels". Release files are direct links: tap → the video plays in the phone
# browser → Share / Download → save to Gallery. The run summary shows the links at the top.
#   usage (from studio/): bash scripts/phone_link.sh <name-slug>
# Needs GH_TOKEN with contents:write. Never fails the run.
set -u
SLUG=$(echo "${1:-reel}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g; s/^-//; s/-$//' | cut -c1-50)
NAME="$(date -u +%m%d)-run${GITHUB_RUN_NUMBER:-0}-${SLUG:-reel}"
TAG=reels
REPO="${GITHUB_REPOSITORY}"

[ -f out/reel.mp4 ] || { echo "no out/reel.mp4 — nothing to deliver"; exit 0; }
gh release view "$TAG" -R "$REPO" >/dev/null 2>&1 ||
  gh release create "$TAG" -R "$REPO" --prerelease --title "📱 Reels — tap a video to download" \
    --notes "Every finished reel lands here as a plain .mp4 (newest at the bottom of Assets). Tap one on your phone → it plays → Download / Share → save to Gallery. The .txt next to it is the caption." ||
  { echo "::warning::could not create the reels release"; exit 0; }

cp out/reel.mp4 "out/$NAME.mp4"
FILES=("out/$NAME.mp4")
[ -f out/caption.txt ] && cp out/caption.txt "out/$NAME-caption.txt" && FILES+=("out/$NAME-caption.txt")
gh release upload "$TAG" -R "$REPO" "${FILES[@]}" --clobber || { echo "::warning::upload to the reels release failed"; exit 0; }

BASE="https://github.com/$REPO/releases/download/$TAG"
{
  echo "## 📱 Download on your phone"
  echo "**[▶️ $NAME.mp4]($BASE/$NAME.mp4)** — tap, then Download / Share → Save video"
  [ -f "out/$NAME-caption.txt" ] && echo "· [caption]($BASE/$NAME-caption.txt)"
  echo "· all reels: https://github.com/$REPO/releases/tag/$TAG"
  echo
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "phone link: $BASE/$NAME.mp4"
