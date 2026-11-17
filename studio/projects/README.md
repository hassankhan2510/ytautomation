# Projects — your own photos, clips and voiceover

Make a folder here per video (e.g. `projects/my-launch/`) and put in it:

| file | what it is |
|---|---|
| any `.jpg .png .webp` | your photos |
| any `.mp4 .mov .webm` | your short clips |
| `assets.txt` | one line per file: `file name.jpg \| what it shows` — the AI places each one where the script talks about it (no line = the file name is used as the description) |
| `voiceover.mp3` / `.m4a` / `.wav` (optional) | your own narration (ElevenLabs, phone, mic) — used instead of a cloned voice |
| `script.txt` (optional) | the script; if missing and you gave a voiceover, the voiceover's words become the script |

Then run **Actions → "Studio — Make from Project"** with the folder name.

What happens: every photo/clip is analysed (where the subject is, faces, clip's most interesting seconds) →
the AI director writes/cuts the script into scenes → your assets are placed by meaning (every one is used) →
narration (your voiceover: speech recognition + our own script-to-voice aligner, Urdu script ⇄ Roman Urdu
aware; or a cloned voice) → render → phone link.

Upload from a phone: open this folder on github.com → **Add file → Upload files**. ⚠️ This repo is
public — anything uploaded here is public.
