#!/usr/bin/env bash
# Download a studio run's artifact and make a 4x4 contact sheet + key facts (for reviewing renders).
#   bash scripts/review_run.sh <run_id> [dest_dir]
set -e
RUN=$1; DEST=${2:-out/review/$RUN}
mkdir -p "$DEST"
gh run download "$RUN" -D "$DEST" >/dev/null
MP4=$(find "$DEST" -name reel.mp4 | head -1)
[ -n "$MP4" ] || { echo "no reel.mp4 in run $RUN"; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MP4")
N=$(python -c "print(max(1,int(float('$DUR')*30/16)))")
ffmpeg -v error -y -i "$MP4" -vf "select='not(mod(n\,$N))',scale=270:-1,tile=4x4" -frames:v 1 "$DEST/sheet.jpg"
echo "reel: $MP4 · ${DUR}s · sheet: $DEST/sheet.jpg"
ffmpeg -nostats -i "$MP4" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+I:|Peak:" | tail -2
