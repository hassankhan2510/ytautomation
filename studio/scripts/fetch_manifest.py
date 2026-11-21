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
import urllib.error
import urllib.parse
import urllib.request

CHOICES = {
    "scriptMode": ["as-written", "ai-rewrite", "from-voiceover"],
    "voice": ["upload", "mine", "mine-sufyan", "mine-pariya", "mine-sabeha", "mine-saher", "omnivoice", "omnivoice-sufyan", "omnivoice-pariya", "omnivoice-sabeha", "omnivoice-saher", "kokoro", "edge", "none"],
    "language": ["english", "urdu"],
    "style": ["explainer", "techNews", "breakdown", "story", "buildInPublic"],
    "theme": ["crimson", "ocean", "grape", "sunrise", "lagoon", "mango", "mint", "neon", "acid", "electric", "paper", "taxi"],
    "channel": ["none", "cohort_zero"],
    "backgrounds": ["video", "photo", "off", "mine"],
    "music": ["auto", "none"],
    "sfx": ["on", "off"],
    "pace": ["fast", "normal", "turbo"],
    "engine": ["classic", "cue"],
}
DEFAULTS = {"scriptMode": "as-written", "voice": "mine", "language": "english", "style": "explainer", "theme": "crimson",
            "channel": "none", "backgrounds": "video", "music": "auto", "sfx": "on", "pace": "fast", "engine": "classic"}
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


def runner_links(paths):
    """Fresh short-lived read links for files in the studio's storage, fetched from the studio page with
    RUNNER_KEY at run time (never printed, so no link appears in the public Actions logs)."""
    studio = os.environ.get("STUDIO_URL", "").rstrip("/")
    key = os.environ.get("RUNNER_KEY", "")
    if not studio.startswith("https://") or len(key) < 20:
        raise SystemExit("STUDIO_URL / RUNNER_KEY GitHub secrets are missing (see studio-web/README.md)")
    req = urllib.request.Request(f"{studio}/api/runner", data=json.dumps({"key": key, "paths": list(paths)}).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "studio-runner"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())["urls"]


def manifest_link(path_or_url):
    """The workflow gets only the manifest's NAME (projects/<id>/…)."""
    if not re.fullmatch(r"projects/[a-z0-9-]{6,40}/[A-Za-z0-9._-]+\.json", str(path_or_url)):
        raise SystemExit("manifest_path must be a storage path like projects/<id>/manifest-….json")
    url = runner_links([path_or_url]).get(path_or_url)
    if not url:
        raise SystemExit("manifest not found in storage")
    return url


def refresh_links(m):
    """The links written into the manifest expire after 6 h (a re-run or a late final render would fail with
    403). Every file also carries its storage name, so ask for fresh links; keep the old link as a fallback."""
    files = [a for a in (m.get("assets") or []) + ([m["voiceover"]] if m.get("voiceover") else [])
             if str(a.get("pathname") or "").startswith("projects/")]
    if not files or not os.environ.get("RUNNER_KEY"):
        return
    try:
        fresh = runner_links([a["pathname"] for a in files])
    except Exception as e:  # keep the manifest's own links
        print(f"  (could not refresh file links: {type(e).__name__})")
        return
    for a in files:
        if fresh.get(a["pathname"]):
            a["url"] = fresh[a["pathname"]]


def main(url, pdir):
    m = json.loads(fetch(manifest_link(url)).decode("utf-8"))
    refresh_links(m)
    os.makedirs(pdir, exist_ok=True)
    s = {**DEFAULTS, **{k: v for k, v in (m.get("settings") or {}).items() if k in CHOICES and v in CHOICES[k]}}
    script_text = str(m.get("script") or "")
    urdu_letters = len(re.findall(r"[؀-ۿ]", script_text))
    if s["language"] != "urdu" and urdu_letters >= 15 and urdu_letters >= 0.2 * len(re.findall(r"[A-Za-z]", script_text)):
        # Urdu letters in the script = an Urdu reel: the screen/captions get Roman Urdu (English letters) and
        # the voice reads the Urdu. As "english" the Urdu letters went straight onto the screen.
        print("::notice::your script is written in Urdu letters -> made as an Urdu reel (captions in English letters)")
        s["language"] = "urdu"
    lines = ["# downloaded from the web page"]
    for k, a in enumerate(m.get("assets") or [], 1):
        kind = "clip" if a.get("kind") == "clip" else "image"
        fn = safe_name(a.get("name"), k, VID if kind == "clip" else IMG, ".mp4" if kind == "clip" else ".jpg")
        try:
            size = fetch(a["url"], os.path.join(pdir, fn))
        except urllib.error.HTTPError as e:  # deleted from storage (or link expired): make the video without it
            print(f"::warning::your {kind} '{a.get('name')}' is no longer in storage (HTTP {e.code}) — made without it; upload it again to include it")
            continue
        desc = re.sub(r"[\r\n|]+", " ", str(a.get("description") or "")).strip()
        lines.append(f"{fn} | {desc}" if desc else f"{fn} | {os.path.splitext(str(a.get('name')))[0]}")
        print(f"  {kind:5s} {fn} ({size // 1024} KB) · {desc[:60]}")
    open(os.path.join(pdir, "assets.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    if m.get("voiceover"):
        ext = os.path.splitext(str(m["voiceover"].get("name", "")))[1].lower()
        ext = ext if ext in AUD else ".m4a"
        try:
            size = fetch(m["voiceover"]["url"], os.path.join(pdir, f"voiceover{ext}"))
            print(f"  voiceover{ext} ({size // 1024} KB)")
        except urllib.error.HTTPError as e:
            raise SystemExit(f"::error::your voiceover '{m['voiceover'].get('name')}' is no longer in storage (HTTP {e.code}) — upload it again")
    elif s["voice"] == "upload":
        print("  ! voice=upload but no voiceover was uploaded -> using the default cloned voice")
        s["voice"] = "mine"
    if str(m.get("script") or "").strip():
        open(os.path.join(pdir, "script.txt"), "w", encoding="utf-8").write(m["script"].strip() + "\n")
    stage = m.get("stage") if m.get("stage") in ("draft", "final", "direct") else "direct"
    pid = str(m.get("projectId") or "")
    pid = pid if re.fullmatch(r"[a-z0-9-]{6,40}", pid) else "web"
    out = os.environ.get("GITHUB_OUTPUT")
    with open(out, "a", encoding="utf-8") if out else sys.stdout as f:
        for k, v in s.items():
            f.write(f"{OUT_KEYS.get(k, k)}={v}\n")
        f.write(f"stage={stage}\nproject_id={pid}\nsettings_json={json.dumps(s)}\n")
        # same script + same voice -> same spoken lines: a re-made video (new project) reuses them
        import hashlib
        skey = hashlib.sha1(f"{' '.join(str(m.get('script') or '').split())}|{s['voice']}|{s['language']}|{s['pace']}".encode("utf-8")).hexdigest()[:16]
        f.write(f"script_key={skey}\n")
    print("settings:", s, "· stage:", stage, "· project:", pid)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
