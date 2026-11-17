"""
STUDIO — CRITIC: the editor watches its OWN render, finds problems, and fixes the EDIT PROGRAM (props),
not the pixels. Because every video is a typed beat sheet, a fix is an exact edit ("beat 7: captions to
the top band"), then the reel is rendered again.

Checks (all measured on the rendered MP4, each finding = time + beat + evidence + fix):
  face_under_caption  a face sits inside the caption band            -> captionPos = the free band
  black_frame         a (near) black / blank frame mid-video          -> report (renderer/asset bug)
  frozen              picture doesn't change for >= 2.5 s while talking -> report (dead visual)
  flash_caption       a caption chunk is on screen < 0.28 s           -> report
  loudness            integrated loudness off the -14 LUFS social target, or true peak > -1 dBTP
                                                                       -> fixed in the final mux (no re-render)
    python scripts/critic.py out/reel.mp4 out/props.json out/critic.json [--apply]
--apply writes the beat fixes into props.json (and prints how many), so the workflow can re-render.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np

W, H = 1080, 1920
BANDS = {"low": (1180, 1560), "mid": (760, 1160), "high": (300, 640)}  # caption block y-ranges (1920 tall)

try:
    import cv2
    _FACE = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
except Exception:
    cv2, _FACE = None, None


def frames(path, fps, w, h):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def beat_spans(job, fps=30):
    """Approximate beat [start,end) seconds from the word timings (one word entry per script token)."""
    words = job.get("words") or []
    spans, k = [], 0
    for b in job["beats"]:
        n = len(str(b.get("text", "")).split())
        ws = words[k:k + n]
        k += n
        spans.append([ws[0]["start"], ws[-1]["end"]] if ws else None)
    for i, s in enumerate(spans):  # a beat lasts until the next beat starts
        if s is None:
            continue
        nxt = next((x for x in spans[i + 1:] if x), None)
        if nxt:
            s[1] = max(s[1], nxt[0])
    return spans


def beat_at(spans, t):
    for i, s in enumerate(spans):
        if s and s[0] <= t < s[1]:
            return i
    return None


def caption_chunks(job):
    """Mirror of Captions.tsx chunking (<=3 words, break on punctuation, per beat)."""
    words, out, cur, k = job.get("words") or [], [], [], 0
    beat_of = []
    for bi, b in enumerate(job["beats"]):
        beat_of += [bi] * len(str(b.get("text", "")).split())
    for i, w in enumerate(words):
        bi = beat_of[i] if i < len(beat_of) else -1
        if cur and (cur[0][1] != bi or len(cur) >= 3):
            out.append(cur); cur = []
        cur.append((w, bi))
        if re.search(r"[.,!?;:—]$", w["w"]):
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    res = []
    for j, c in enumerate(out):
        start = c[0][0]["start"]
        nxt = out[j + 1][0][0]["start"] if j + 1 < len(out) else c[-1][0]["end"] + 0.4
        res.append({"start": start, "end": min(nxt, c[-1][0]["end"] + 0.4), "text": " ".join(x[0]["w"] for x in c), "beat": c[0][1]})
    return res


def faces_in(img):
    if _FACE is None:
        return []
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    s = img.shape[0] / H
    found = _FACE.detectMultiScale(g, scaleFactor=1.08, minNeighbors=5, minSize=(int(70 * s), int(70 * s)))
    return [(x / s, y / s, w / s, h / s) for (x, y, w, h) in found]


def overlap(face, band):
    _, y, _, h = face
    lo, hi = BANDS[band]
    return max(0.0, min(y + h, hi) - max(y, lo)) / max(1.0, h)


def loudness(path):
    err = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    I = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    P = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    return (float(I[-1]) if I else None), (float(P[-1]) if P else None)


def critique(mp4, job):
    issues, patches = [], {}
    spans = beat_spans(job)
    fps_s = 3
    small = frames(mp4, fps_s, 270, 480).astype(np.float32) / 255
    T = len(small) / fps_s
    # black / blank frames (ignore the first and last 0.4 s: fades)
    for i, f in enumerate(small):
        t = i / fps_s
        if 0.4 < t < T - 0.4 and f.mean() < 0.035 and f.std() < 0.02:
            issues.append({"t": round(t, 2), "beat": beat_at(spans, t), "type": "black_frame", "severity": "high",
                           "evidence": f"mean {f.mean():.3f}, std {f.std():.3f}", "fix": None})
    # frozen picture while talking
    d = [np.abs(small[i] - small[i - 1]).mean() for i in range(1, len(small))]
    run = 0
    for i, x in enumerate(d, 1):
        run = run + 1 if x < 0.0015 else 0
        if run == int(2.5 * fps_s):
            t = i / fps_s
            b = beat_at(spans, t)
            if b is not None:
                issues.append({"t": round(t - 2.5, 2), "beat": b, "type": "frozen", "severity": "medium",
                               "evidence": "no visible change for 2.5 s while narration continues", "fix": None})
    # faces under the caption band (only where captions are on screen)
    chunks = caption_chunks(job)
    if _FACE is not None and chunks:
        big = frames(mp4, 2, 540, 960)
        per_beat = {}
        for i, f in enumerate(big):
            t = i / 2
            ch = next((c for c in chunks if c["start"] <= t < c["end"]), None)
            if not ch or ch["beat"] < 0:
                continue
            for fc in faces_in(f):
                per_beat.setdefault(ch["beat"], []).append(fc)
        for b, fcs in per_beat.items():
            pos = job["beats"][b].get("captionPos", "low")
            ov = max(overlap(fc, pos) for fc in fcs)
            if ov > 0.25 and len(fcs) >= 2:  # seen in >= 2 samples: not a one-frame false positive
                best = min(BANDS, key=lambda band: sum(overlap(fc, band) for fc in fcs))
                if best != pos:
                    patches.setdefault(str(b), {})["captionPos"] = best
                issues.append({"t": round(spans[b][0], 2) if spans[b] else None, "beat": b, "type": "face_under_caption", "severity": "high",
                               "evidence": f"{len(fcs)} face detections, {int(100 * ov)}% of a face inside the {pos} caption band",
                               "fix": {"captionPos": best} if best != pos else None})
    # captions that flash by too fast to read
    for c in chunks:
        if c["end"] - c["start"] < 0.28 and len(c["text"]) > 3:
            issues.append({"t": round(c["start"], 2), "beat": c["beat"], "type": "flash_caption", "severity": "low",
                           "evidence": f"'{c['text']}' on screen {1000 * (c['end'] - c['start']):.0f} ms", "fix": None})
    # loudness for social feeds
    I, P = loudness(mp4)
    audio_fix = False
    if I is not None and (abs(I + 14) > 2 or (P is not None and P > -1.0)):
        audio_fix = True
        issues.append({"t": None, "beat": None, "type": "loudness", "severity": "medium",
                       "evidence": f"integrated {I:.1f} LUFS, peak {P} dBFS (target -14 LUFS, < -1 dBTP)", "fix": "loudnorm in final mux"})
    return {"duration": round(T, 2), "issues": issues, "patches": patches, "audio_fix": audio_fix, "loudness": I, "peak": P}


def fix_audio(mp4):
    tmp = mp4 + ".tmp.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", mp4, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", tmp], check=True)
    os.replace(tmp, mp4)


if __name__ == "__main__":
    mp4, props_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    props = json.load(open(props_path, encoding="utf-8"))
    rep = critique(mp4, props["job"])
    json.dump(rep, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    kinds = {}
    for x in rep["issues"]:
        kinds[x["type"]] = kinds.get(x["type"], 0) + 1
    msg = f"🔎 **Self-check:** {len(rep['issues'])} finding(s) " + (", ".join(f"{k} ×{v}" for k, v in kinds.items()) or "— clean") \
        + f" · {len(rep['patches'])} scene fix(es) to apply" + (" · loudness fixed" if rep["audio_fix"] else "")
    print(msg)
    for x in rep["issues"][:20]:
        print(f"  {x['type']:18s} t={x['t']} beat={x['beat']} · {x['evidence']}" + (f" → {x['fix']}" if x['fix'] else ""))
    if "--apply" in sys.argv:
        for b, p in rep["patches"].items():
            props["job"]["beats"][int(b)].update(p)
        json.dump(props, open(props_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        if rep["audio_fix"]:
            fix_audio(mp4)
        print(f"  applied {len(rep['patches'])} scene fix(es)" + (" + loudness" if rep["audio_fix"] else ""))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(msg + "\n")
    # exit code 3 = scene fixes were applied -> the workflow re-renders
    sys.exit(3 if ("--apply" in sys.argv and rep["patches"]) else 0)
