"""
STUDIO — FETCH A WEB PROJECT: download what the web page uploaded into studio/projects/<dir>/ so the
normal project pipeline can run on it, and print the settings for the workflow.

    python scripts/fetch_manifest.py <manifest_url> <project_dir>
Writes: photos/clips (+ assets.txt with the descriptions), voiceover.<ext>, script.txt, and one
`key=value` line per setting to $GITHUB_OUTPUT (validated against the same whitelists as the page).
Only Vercel Blob URLs are accepted — the runner never downloads from anywhere else.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

CHOICES = {
    "scriptMode": ["as-written", "ai-rewrite", "from-voiceover"],
    "voice": ["upload", "mine", "mine-sufyan", "mine-pariya", "mine-sabeha", "omnivoice", "omnivoice-sufyan", "omnivoice-pariya", "omnivoice-sabeha", "kokoro", "edge", "none"],
    "language": ["english", "urdu"],
    "style": ["explainer", "techNews", "breakdown", "story", "buildInPublic"],
    "theme": ["crimson", "ocean", "grape", "sunrise", "lagoon", "mango", "mint", "neon", "acid", "electric", "paper", "taxi"],
    "channel": ["none", "cohort_zero"],
    "backgrounds": ["video", "photo", "off"],
    "music": ["auto", "none"],
    "sfx": ["on", "off"],
}
DEFAULTS = {"scriptMode": "as-written", "voice": "mine", "language": "english", "style": "explainer", "theme": "crimson",
            "channel": "none", "backgrounds": "video", "music": "auto", "sfx": "on"}
OUT_KEYS = {"scriptMode": "script_mode"}
IMG = (".jpg", ".jpeg", ".png", ".webp")
VID = (".mp4", ".mov", ".m4v", ".webm")
AUD = (".mp3", ".m4a", ".wav", ".ogg", ".opus", ".aac", ".flac", ".webm")


def allowed(url):
    h = urllib.parse.urlparse(url).hostname or ""
    return urllib.parse.urlparse(url).scheme == "https" and h.endswith(".blob.vercel-storage.com")


def fetch(url, dst=None, limit=600 * 1024 * 1024):
    if not allowed(url):
        raise SystemExit(f"refusing to download from {urllib.parse.urlparse(url).hostname!r} (only Vercel Blob)")
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "studio-runner"}), timeout=300) as r:
        if dst is None:
            return r.read(limit)
        n = 0
        with open(dst, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                n += len(b)
                if n > limit:
                    raise SystemExit(f"{dst}: file too large")
                f.write(b)
        return n


def safe_name(name, k, exts, default_ext):
    base, ext = os.path.splitext(os.path.basename(str(name)))
    ext = ext.lower() if ext.lower() in exts else default_ext
    base = re.sub(r"[^A-Za-z0-9 ._-]+", "", base).strip(" .")[:50] or f"asset{k}"
    return f"{k:02d}-{base}{ext}"


def main(url, pdir):
    m = json.loads(fetch(url).decode("utf-8"))
    os.makedirs(pdir, exist_ok=True)
    s = {**DEFAULTS, **{k: v for k, v in (m.get("settings") or {}).items() if k in CHOICES and v in CHOICES[k]}}
    lines = ["# downloaded from the web page"]
    for k, a in enumerate(m.get("assets") or [], 1):
        kind = "clip" if a.get("kind") == "clip" else "image"
        fn = safe_name(a.get("name"), k, VID if kind == "clip" else IMG, ".mp4" if kind == "clip" else ".jpg")
        size = fetch(a["url"], os.path.join(pdir, fn))
        desc = re.sub(r"[\r\n|]+", " ", str(a.get("description") or "")).strip()
        lines.append(f"{fn} | {desc}" if desc else f"{fn} | {os.path.splitext(str(a.get('name')))[0]}")
        print(f"  {kind:5s} {fn} ({size // 1024} KB) · {desc[:60]}")
    open(os.path.join(pdir, "assets.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    if m.get("voiceover"):
        ext = os.path.splitext(str(m["voiceover"].get("name", "")))[1].lower()
        ext = ext if ext in AUD else ".m4a"
        size = fetch(m["voiceover"]["url"], os.path.join(pdir, f"voiceover{ext}"))
        print(f"  voiceover{ext} ({size // 1024} KB)")
    elif s["voice"] == "upload":
        print("  ! voice=upload but no voiceover was uploaded -> using the default cloned voice")
        s["voice"] = "mine"
    if str(m.get("script") or "").strip():
        open(os.path.join(pdir, "script.txt"), "w", encoding="utf-8").write(m["script"].strip() + "\n")
    out = os.environ.get("GITHUB_OUTPUT")
    with open(out, "a", encoding="utf-8") if out else sys.stdout as f:
        for k, v in s.items():
            f.write(f"{OUT_KEYS.get(k, k)}={v}\n")
    print("settings:", s)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
