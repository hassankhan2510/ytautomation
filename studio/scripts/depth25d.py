"""
STUDIO — 2.5D: turn still photos into depth layers so the renderer can move them in parallax
("the photo comes alive" — the classic documentary move).

  python scripts/depth25d.py out/props.json      (edits props in place; safe to skip/fail)

For every still image a beat uses (an image background, or the src of a photo/parallax scene):
  1. Depth Anything V2 Small (Apache-2.0) estimates relative depth on CPU (~1-3 s/photo).
  2. The photo is split into far / mid / near layers with feathered alpha edges.
  3. Pixels hidden behind the mid+near layers are inpainted on the far layer, so moving layers
     never reveal holes.
Writes public/gen/<name>_far.jpg, _mid.png, _near.png and sets beat.layers / beat.props.layers.
Any failure leaves the beat untouched → the renderer falls back to a plain Ken-Burns move.
"""
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
MAX_PHOTOS = int(os.environ.get("DEPTH_MAX", "8"))
_pipe = None


def depth_pipe():
    global _pipe
    if _pipe is None:
        from transformers import pipeline

        _pipe = pipeline("depth-estimation", model=MODEL, device="cpu")
    return _pipe


def smoothstep(x, a, b):
    t = np.clip((x - a) / max(1e-6, b - a), 0, 1)
    return t * t * (3 - 2 * t)


def make_layers(rel):
    """rel: path under public/ of a still image. Returns {'far','mid','near'} rel paths or None."""
    import cv2

    src = os.path.join(PUBLIC, rel)
    img = Image.open(src).convert("RGB")
    # Work at <= 1920 px on the long side (the render is 1080x1920) so layers stay sharp full-screen.
    scale = 1920 / max(img.size) if max(img.size) > 1920 else 1.0
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    w, h = img.size
    depth = depth_pipe()(img)["depth"].resize((w, h), Image.BICUBIC)  # brighter = nearer
    d = np.asarray(depth, dtype=np.float32)
    d = (d - d.min()) / max(1e-6, d.max() - d.min())
    q_mid, q_near = np.quantile(d, 0.45), np.quantile(d, 0.75)
    if q_near - q_mid < 0.04:  # flat image (e.g. a wall/document) — parallax would look broken
        return None
    near = smoothstep(d, q_near - 0.04, q_near + 0.04)
    mid = smoothstep(d, q_mid - 0.04, q_mid + 0.04) * (1 - near)
    feather = lambda m: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255  # noqa: E731
    near, mid = feather(near), feather(mid)
    rgb = np.asarray(img)
    # Far layer: fill what mid+near cover (dilated so edges never show), inpainted at half size for speed.
    hole = ((mid + near) > 0.15).astype(np.uint8) * 255
    hole = cv2.dilate(hole, np.ones((15, 15), np.uint8))
    small = cv2.resize(rgb, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    small_hole = cv2.resize(hole, (w // 2, h // 2), interpolation=cv2.INTER_NEAREST)
    filled = cv2.inpaint(cv2.cvtColor(small, cv2.COLOR_RGB2BGR), small_hole, 9, cv2.INPAINT_TELEA)
    filled = cv2.cvtColor(cv2.resize(filled, (w, h), interpolation=cv2.INTER_CUBIC), cv2.COLOR_BGR2RGB)
    far = np.where((hole > 0)[..., None], filled, rgb).astype(np.uint8)
    # Mid layer must also cover what near hides, so near can move without exposing the far layer.
    mid_full = np.clip(mid + near, 0, 1)

    base = os.path.splitext(rel)[0].replace("\\", "/")
    out = {"far": f"{base}_far.jpg", "mid": f"{base}_mid.png", "near": f"{base}_near.png"}
    Image.fromarray(far).save(os.path.join(PUBLIC, out["far"]), quality=90)
    Image.fromarray(np.dstack([rgb, (mid_full * 255).astype(np.uint8)]), "RGBA").save(os.path.join(PUBLIC, out["mid"]), optimize=True)
    Image.fromarray(np.dstack([rgb, (near * 255).astype(np.uint8)]), "RGBA").save(os.path.join(PUBLIC, out["near"]), optimize=True)
    return out


def main():
    props_path = sys.argv[1] if len(sys.argv) > 1 else "out/props.json"
    props = json.load(open(props_path, encoding="utf-8"))
    job = props["job"]
    done, t0 = 0, time.time()
    for i, b in enumerate(job["beats"]):
        if done >= MAX_PHOTOS:
            break
        targets = []
        if b.get("bgKind") == "image" and b.get("bgSrc"):
            targets.append(("bg", b["bgSrc"]))
        p = b.get("props") or {}
        if b.get("primitive") in ("parallax", "photo") and isinstance(p.get("src"), str) and not p["src"].startswith("http"):
            targets.append(("scene", p["src"]))
        for kind, rel in targets:
            try:
                layers = make_layers(rel)
            except Exception as e:  # never break a render over an effect
                print(f"  beat {i}: 2.5D skipped ({e})")
                continue
            if not layers:
                print(f"  beat {i}: 2.5D skipped (image too flat)")
                continue
            if kind == "bg":
                b["layers"] = layers
            else:
                b.setdefault("props", {})["layers"] = layers
            done += 1
            print(f"  beat {i}: 2.5D layers for {rel}")
    json.dump(props, open(props_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    msg = f"🌄 2.5D: {done} photo(s) brought to life in {time.time() - t0:.0f}s"
    print(msg)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(msg + "\n")


if __name__ == "__main__":
    main()
