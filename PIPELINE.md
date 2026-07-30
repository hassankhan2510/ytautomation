# ⚙️ The Pipeline — How a Topic Becomes a Video

You give **topic + style + duration + platform**. The system does the rest:

```
Your brief  ──▶  AI (script.json)  ──▶  Voiceover + timing  ──▶  Assets  ──▶  Render  ──▶  MP4
   (you)          (ChatGPT/Claude)        (edge-tts, free)      (Pexels)     (Remotion)
```

Everything below runs inside the `theranos-doc/` folder.

---

## One-time setup

```bash
cd theranos-doc
npm install
pip install edge-tts
```

**Optional (for automatic asset download):** get a free key at <https://www.pexels.com/api/> and set it:

```bash
# PowerShell
$env:PEXELS_API_KEY = "your_key_here"
```

Without a key, the pipeline reuses whatever is already in `public/assets/` and tells you what's missing.

---

## Making a video (every time)

### 1. Generate the script
Paste `Remotion_AI_Prompt_System.md` + your `INPUT_TEMPLATE.md` brief into an AI.
Save its JSON output as **`theranos-doc/src/data/script.json`**.

### 2. Voiceover + assets + compression
```bash
npm run prepare-video
```
This runs three steps:
- `gen_voiceover.py` → creates `public/audio/line_XX.mp3` for every line and writes
  `src/data/timeline.json` (exact frame timing + karaoke word timing). It also enforces
  the **hard duration check** — if the script is well under `targetDurationMin`, it fails
  and tells you how many more lines to add.
- `fetch_assets.mjs` → downloads any missing images/video from Pexels using each line's keywords.
- `compress_assets.mjs` → downscales assets to 1080p and re-encodes them (typically 90%+
  smaller for video). This makes renders much faster and saves disk. It is idempotent —
  a manifest (`public/assets/.compressed.json`) ensures nothing is compressed twice.

### 3. Preview (optional, live editor)
```bash
npm run dev            # opens Remotion Studio in the browser
```

### 4. Render the final video
```bash
npm run render:youtube   # 16:9  -> out/video.mp4
npm run render:shorts    # 9:16  -> out/shorts.mp4
npm run render:square    # 1:1   -> out/square.mp4
```
The same script renders in all three aspect ratios — author once, post everywhere.

---

## ⚠️ Windows disk-space note (important on this machine)

Your `C:` drive is nearly full, and Remotion extracts video frames to the system temp on `C:`.
If a render fails with **"Failed to fetch … disk space is low"**, redirect temp to `D:`:

```bash
# run once per terminal session before rendering
export TMP="D:/remotion-temp"
export TEMP="D:/remotion-temp"
npx remotion render YouTube out/video.mp4
```

(Or free up space on `C:`.) A ~6-minute 1080p render needs a few GB of scratch space.

---

## What each file is

| File | Role |
|---|---|
| `Remotion_AI_Prompt_System.md` | The prompt that turns your brief into `script.json` |
| `INPUT_TEMPLATE.md` | The 4-field brief you fill in each time |
| `src/data/script.json` | **The only thing that changes per video** (content + meta) |
| `src/data/timeline.json` | Auto-generated timing (do not edit by hand) |
| `scripts/gen_voiceover.py` | AI narration + timing generator (edge-tts) + duration check |
| `scripts/fetch_assets.mjs` | Automatic stock asset downloader (Pexels) + compress-on-download |
| `scripts/compress_assets.mjs` | Downscales/compresses assets for fast renders + less disk |
| `scripts/lib_compress.mjs` | Shared ffmpeg compression helper (uses Remotion's ffmpeg) |
| `src/compositions/DocVideo.tsx` | The reusable render engine (rarely changes) |
| `src/components/*` | Background (Ken Burns / video) + karaoke caption card |
| `src/Root.tsx` | Registers YouTube / Shorts / Square compositions |

---

## Changing the look

- **Voice / accent color / pace:** edit `meta` in `script.json` (`voice`, `accentColor`,
  `pauseBetweenLinesSec`), then re-run `npm run voiceover`.
- **Caption position / size / animation:** `src/components/Caption.tsx`.
- **Background motion (Ken Burns / vignette):** `src/components/Background.tsx` and `DocVideo.tsx`.
