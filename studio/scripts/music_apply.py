"""Fit the job's music bed to THIS video (after narration, when the length is known):
drop = the first high-energy beat after the hook (energy 3), else ~1/3 in. Writes public/audio/music_fit.wav
and points job.music at it (job.musicFit = true -> the renderer stops looping it).
    python scripts/music_apply.py out/props.json [total_seconds]   (default: computed like timeline.ts)"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from music_fit import fit  # noqa: E402

def video_seconds(job, fps=30):
    """Exact composition length — mirrors buildTimeline() in src/engine/timeline.ts (words path)."""
    fps = job.get("fps") or fps
    words = job.get("words") or []
    if not words:
        return None
    starts, slices, wi = [], [], 0
    for b in job["beats"]:
        n = len(str(b.get("text", "")).split())
        sl = words[wi:wi + n]; wi += n
        slices.append(sl)
        prev = slices[-2] if len(slices) > 1 else []
        prev_end = prev[-1]["end"] + 0.3 if prev else (starts[-1] + 1 if starts else 0)
        starts.append(sl[0]["start"] if sl else prev_end)
    last_end = words[-1]["end"]
    i = len(job["beats"]) - 1
    frm = 0 if i == 0 else round(starts[i] * fps)
    nxt = round((last_end + 0.5 + float(job["beats"][i].get("hold") or 0)) * fps)
    frames = max(round(0.6 * fps), nxt - frm)
    return max(fps, frm + frames) / fps


props_path = sys.argv[1]
props = json.load(open(props_path, encoding="utf-8"))
job = props["job"]
total = float(sys.argv[2]) if len(sys.argv) > 2 else video_seconds(job)
if not total:
    print("no word timings — cannot fit music"); sys.exit(0)
if not job.get("music"):
    print("no music bed — nothing to fit"); sys.exit(0)
words, starts, k = job.get("words") or [], [], 0
for b in job["beats"]:
    n = len(str(b.get("text", "")).split())
    starts.append(words[k]["start"] if n and k < len(words) else None)
    k += n
drop = next((s for b, s in zip(job["beats"][1:], starts[1:]) if s and int(b.get("energy") or 2) == 3), None) or total / 3
src = os.path.join("public", job["music"])
out_rel = "audio/music_fit.wav"
rep = fit(src, total, drop, os.path.join("public", out_rel))
job["music"], job["musicFit"] = out_rel, True
json.dump(props, open(props_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
msg = (f"🎵 **Music fitted to the story:** {rep['bpm']} BPM · {rep['output_bars']} bars · drop at {drop:.1f}s on the track's "
       f"#{rep['drop_rise_rank']} biggest lift · {rep['jumps']} seamless jump(s) · ends on the track's own ending: {rep['ends_on_track_ending']} · {rep['seconds']}s")
print(msg)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(msg + "\n")
