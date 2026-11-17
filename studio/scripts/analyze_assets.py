"""
STUDIO — ANALYZE ASSETS: understand every photo / clip the creator uploads, before the AI places it.

Per IMAGE: size, orientation, the SUBJECT's position (faces first; else a saliency model), how sharp it is
— so crops and camera moves centre on the subject instead of the frame centre (a 16:9 photo cropped to
9:16 by the centre cuts people in half).
Per CLIP: duration, and a per-second INTEREST curve (motion energy + sharpness + saliency) so the editor
trims to the best seconds, not the first ones; plus the subject position over time.

Saliency = spectral residual (Hou & Zhang 2007) on a small grey image + centre prior + colour
contrast; faces = OpenCV's bundled Haar cascade when OpenCV is installed (no download), else skipped.

    python scripts/analyze_assets.py <project_dir> [out.json]
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, uniform_filter

IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")
VID_EXT = (".mp4", ".mov", ".m4v", ".webm", ".mkv")

try:
    import cv2  # optional
    _FACE = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
except Exception:  # no OpenCV -> saliency only
    cv2, _FACE = None, None


def saliency(rgb):
    """rgb float [H,W,3] 0..1 -> saliency map [H,W] 0..1 (spectral residual + colour contrast + centre prior)."""
    H, W = rgb.shape[:2]
    g = rgb.mean(-1)
    small = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((64, 64), Image.BILINEAR), np.float32) / 255
    F = np.fft.fft2(small)
    logA = np.log(np.abs(F) + 1e-6)
    sr = np.abs(np.fft.ifft2(np.exp(logA - uniform_filter(logA, 3) + 1j * np.angle(F)))) ** 2
    sr = gaussian_filter(sr, 2.5)
    sr = np.asarray(Image.fromarray((sr / (sr.max() + 1e-9) * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32) / 255
    # colour contrast: distance from the blurred image's colour (things that stand out from surroundings)
    blur = np.stack([gaussian_filter(rgb[..., c], max(H, W) / 12) for c in range(3)], -1)
    cc = np.sqrt(((rgb - blur) ** 2).sum(-1)); cc = gaussian_filter(cc, max(H, W) / 80)
    cc /= cc.max() + 1e-9
    yy, xx = np.mgrid[0:H, 0:W]
    centre = np.exp(-(((xx / W - 0.5) / 0.38) ** 2 + ((yy / H - 0.45) / 0.42) ** 2))
    s = (0.55 * sr + 0.45 * cc) * (0.35 + 0.65 * centre)
    return s / (s.max() + 1e-9)


def faces(rgb):
    if _FACE is None:
        return []
    g = (rgb.mean(-1) * 255).astype(np.uint8)
    H, W = g.shape
    found = _FACE.detectMultiScale(g, scaleFactor=1.1, minNeighbors=6, minSize=(max(24, W // 25), max(24, W // 25)))
    return [{"x": float((x + w / 2) / W), "y": float((y + h / 2) / H), "w": float(w / W), "h": float(h / H)} for (x, y, w, h) in found]


def focus_point(rgb):
    """Where the subject is (0..1). Faces win (weighted by size); else the saliency peak region's centroid."""
    fs = faces(rgb)
    if fs:
        wsum = sum(f["w"] * f["h"] for f in fs)
        x = sum(f["x"] * f["w"] * f["h"] for f in fs) / wsum
        y = sum((f["y"] + 0.1 * f["h"]) * f["w"] * f["h"] for f in fs) / wsum  # a bit below eyes: whole face
        return {"x": round(x, 3), "y": round(y, 3), "by": "faces", "faces": fs}
    s = saliency(rgb)
    m = s >= np.quantile(s, 0.97)
    yy, xx = np.nonzero(m)
    w = s[m]
    H, W = s.shape
    return {"x": round(float((xx * w).sum() / w.sum() / W), 3), "y": round(float((yy * w).sum() / w.sum() / H), 3), "by": "saliency", "faces": []}


def sharpness(rgb):
    g = rgb.mean(-1)
    lap = np.abs(4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:])
    return float(lap.mean())


def load_image(path, maxside=640):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    s = maxside / max(W, H)
    if s < 1:
        im = im.resize((int(W * s), int(H * s)), Image.BILINEAR)
    return np.asarray(im, np.float32) / 255, (W, H)


def analyze_image(path):
    rgb, (W, H) = load_image(path)
    fp = focus_point(rgb)
    return {"kind": "image", "w": W, "h": H, "orientation": "portrait" if H > W * 1.1 else "landscape" if W > H * 1.1 else "square",
            "focus": {"x": fp["x"], "y": fp["y"]}, "focus_by": fp["by"], "faces": len(fp["faces"]),
            "sharpness": round(sharpness(rgb), 4)}


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                          "-of", "json", path], capture_output=True, text=True).stdout
    j = json.loads(out or "{}")
    st = (j.get("streams") or [{}])[0]
    return float(j.get("format", {}).get("duration", 0) or 0), int(st.get("width", 0) or 0), int(st.get("height", 0) or 0)


def analyze_clip(path, fps=2, side=160):
    dur, W, H = probe(path)
    h = max(2, int(side * H / max(1, W))) // 2 * 2
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={side}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, h, side, 3).astype(np.float32) / 255 if raw else np.zeros((0, h, side, 3), np.float32)
    motion = [0.0] + [float(np.abs(fr[i] - fr[i - 1]).mean()) for i in range(1, len(fr))]
    sharp = [sharpness(f) for f in fr]
    sal = [float(np.quantile(saliency(f), 0.99)) for f in fr]
    def z(v):
        v = np.asarray(v, np.float32)
        return (v - v.mean()) / (v.std() + 1e-6) if len(v) else v
    # interest: some motion is good, a whip-pan blur is not -> motion capped, sharpness rewarded
    interest = 0.45 * np.clip(z(motion), -2, 1.5) + 0.35 * z(sharp) + 0.2 * z(sal)
    secs = [round(float(x), 3) for x in interest[::fps]] if len(interest) else []
    mid = fr[len(fr) // 2] if len(fr) else None
    fp = focus_point(mid) if mid is not None else {"x": 0.5, "y": 0.45, "by": "none"}
    return {"kind": "clip", "w": W, "h": H, "duration": round(dur, 2),
            "orientation": "portrait" if H > W * 1.1 else "landscape" if W > H * 1.1 else "square",
            "interest_per_second": secs, "focus": {"x": fp["x"], "y": fp["y"]}, "focus_by": fp["by"]}


def best_window(interest, length):
    """Start second of the most interesting `length`-second window."""
    if not interest or length >= len(interest):
        return 0.0
    k = max(1, int(round(length)))
    c = np.convolve(np.asarray(interest), np.ones(k), "valid")
    return float(int(np.argmax(c)))


def read_descriptions(project):
    """assets.txt: one line per file  ->  'file name.jpg | what it shows'  (or 'file: desc').
    Files without a line get their file name as the description ('Elon Musk.jpg' -> 'Elon Musk')."""
    d = {}
    p = os.path.join(project, "assets.txt")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            for sep in ("|", ":", " - "):
                if sep in line:
                    f, desc = line.split(sep, 1)
                    d[f.strip().lower()] = desc.strip()
                    break
    return d


def analyze_project(project):
    desc = read_descriptions(project)
    items = []
    for root, _, files in os.walk(project):
        for f in sorted(files):
            ext = os.path.splitext(f)[1].lower()
            if ext not in IMG_EXT + VID_EXT:
                continue
            path = os.path.join(root, f)
            rel = os.path.relpath(path, project).replace("\\", "/")
            name = os.path.splitext(f)[0]
            d = desc.get(f.lower()) or desc.get(rel.lower()) or desc.get(name.lower()) or name.replace("_", " ").replace("-", " ")
            try:
                a = analyze_image(path) if ext in IMG_EXT else analyze_clip(path)
            except Exception as e:  # a broken file never kills the run
                print(f"  ! could not analyse {rel}: {e}")
                continue
            a.update({"file": rel, "description": d})
            items.append(a)
            print(f"  {a['kind']:5s} {rel:40s} {a['orientation']:9s} focus ({a['focus']['x']:.2f},{a['focus']['y']:.2f}) by {a['focus_by']}"
                  + (f" · {a['duration']}s" if a['kind'] == 'clip' else "") + f" · \"{d[:50]}\"")
    return items


if __name__ == "__main__":
    proj = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(proj, "_analysis.json")
    items = analyze_project(proj)
    json.dump({"project": proj, "assets": items}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"analysed {len(items)} assets -> {out}")
