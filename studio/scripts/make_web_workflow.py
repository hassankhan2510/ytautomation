"""Generates .github/workflows/studio-web.yml from studio-project.yml, so the web flow always runs the
SAME engine as the project flow. Re-run after editing studio-project.yml:
    python studio/scripts/make_web_workflow.py"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = open(os.path.join(ROOT, ".github", "workflows", "studio-project.yml"), encoding="utf-8").read()

head = '''name: "Studio — Make from Web"

# Started by the web page (studio-web/, hosted on Vercel): the page uploads your photos/clips/voiceover
# to Vercel Blob, writes a manifest and dispatches this workflow with its (time-limited) link.
# Everything after "Fetch the project" is generated from studio-project.yml — edit that file and run
# `python studio/scripts/make_web_workflow.py`, never this one by hand.
run-name: "${{ inputs.title }} [${{ inputs.project_id }}]"
on:
  workflow_dispatch:
    inputs:
      manifest_url:
        description: "Manifest link from the web page"
        required: true
        type: string
      title:
        description: "Title shown in the page's 'My videos' list"
        required: false
        type: string
        default: "web reel"
      project_id:
        description: "Web project id (for cleanup)"
        required: false
        type: string
        default: "web"

'''
jobs = src[src.index("jobs:"):]
jobs = jobs.replace("PROJECT_DIR: projects/${{ github.event.inputs.project }}", "PROJECT_DIR: projects/web-${{ github.run_id }}")
fetch = '''      - name: Fetch the project from the web page
        id: cfg
        run: python scripts/fetch_manifest.py "${{ inputs.manifest_url }}" "$PROJECT_DIR"
'''
anchor = "      - name: Find the project files\n"
assert anchor in jobs
jobs = jobs.replace(anchor, fetch + anchor, 1)
jobs = jobs.replace("github.event.inputs.script", "steps.cfg.outputs.script_mode")
for k in ("voice", "language", "style", "theme", "channel", "backgrounds", "music", "sfx"):
    jobs = jobs.replace(f"github.event.inputs.{k}", f"steps.cfg.outputs.{k}")
jobs = jobs.replace("${{ github.event.inputs.project }}", "web-${{ github.run_id }}")
# phone link: a fixed, predictable name the page can find: web-<run id>.mp4
jobs = re.sub(r'run: bash scripts/phone_link\.sh "[^\n]*"', 'run: PHONE_NAME="web-${{ github.run_id }}" bash scripts/phone_link.sh web', jobs)
assert "github.event.inputs" not in jobs, [l for l in jobs.splitlines() if "github.event.inputs" in l]

# ── STAGES: draft (fast, for the editor) · final (from the edited draft) · direct (one shot, old behaviour) ──
NOT_FINAL = "steps.cfg.outputs.stage != 'final'"
NOT_DRAFT = "steps.cfg.outputs.stage != 'draft'"


def gate(text, name_prefix, cond):
    """add (or AND into) an `if:` on the step whose name starts with name_prefix"""
    m = re.search(r"(      - name: " + re.escape(name_prefix) + r"[^\n]*\n)((?:        [^\n]*\n)*)", text)
    assert m, name_prefix
    head_, body = m.group(1), m.group(2)
    if re.search(r"^        if: ", body, re.M):
        body = re.sub(r"^        if: \$\{\{ (.*) \}\}$", lambda mm: f"        if: ${{{{ ({mm.group(1)}) && {cond} }}}}", body, count=1, flags=re.M)
    else:
        body = f"        if: ${{{{ {cond} }}}}\n" + body
    return text[: m.start()] + head_ + body + text[m.end():]


for n in ("⓪ Understand", "⓪b Transcribe", "① Script", "② Place", "②b 2.5D"):
    jobs = gate(jobs, n, NOT_FINAL)
jobs = gate(jobs, "Install system libraries", NOT_DRAFT)   # headless-Chrome libs: render only (ffmpeg is preinstalled)
# voice engines (torch, Chatterbox, OmniVoice ~3-4 min) are not needed for a draft
jobs = jobs.replace('          if [ "$VOICE" != "upload" ] && [ "$VOICE" != "none" ]; then',
                    '          if [ "$VOICE" != "upload" ] && [ "$VOICE" != "none" ] && [ "${{ steps.cfg.outputs.stage }}" != "draft" ]; then', 1)
for n in ("③ Narration", "③b Fit the music", "④ Render", "⑤ Self-check", "⑥ Caption", "Deliver", "📱 Phone link"):
    jobs = gate(jobs, n, NOT_DRAFT)

publish = '''      - name: 📝 Publish the draft for the editor
        if: ${{ steps.cfg.outputs.stage == 'draft' }}
        env:
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
          DRAFT_SETTINGS: ${{ steps.cfg.outputs.settings_json }}
        run: |
          npm install --prefix ../studio-web --no-audit --no-fund --silent
          node ../studio-web/tools/blob_sync.mjs push "${{ steps.cfg.outputs.project_id }}" out/props.json public

'''
pull = '''      - name: 📥 Pull your edited draft
        if: ${{ steps.cfg.outputs.stage == 'final' }}
        env:
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
        run: |
          npm install --prefix ../studio-web --no-audit --no-fund --silent
          node ../studio-web/tools/blob_sync.mjs pull "${{ steps.cfg.outputs.project_id }}" out/props.json public

      - name: Voice lines from earlier runs of this project (line-by-line regeneration)
        if: ${{ steps.cfg.outputs.stage != 'draft' }}
        uses: actions/cache@v4
        with:
          path: studio/out/voicecache
          key: voice-${{ steps.cfg.outputs.project_id }}-${{ github.run_id }}
          restore-keys: voice-${{ steps.cfg.outputs.project_id }}-

'''
a = "      - name: ③ Narration"
assert a in jobs
jobs = jobs.replace(a, publish + pull + a, 1)
# narration uses the line cache
jobs = jobs.replace("          TRANSCRIPT: out/transcript.json\n", "          TRANSCRIPT: out/transcript.json\n          VOICE_CACHE: out/voicecache\n", 1)
# the stage is a workflow input too, so the run's NAME shows it (the page lists drafts vs finals)
head = head.replace('''      project_id:
        description: "Web project id (for cleanup)"''', '''      stage:
        description: "draft | final | direct"
        required: false
        type: string
        default: "direct"
      project_id:
        description: "Web project id (for cleanup)"''')
head = head.replace('run-name: "${{ inputs.title }} [${{ inputs.project_id }}]"', 'run-name: "${{ inputs.title }} · ${{ inputs.stage }} [${{ inputs.project_id }}]"')
open(os.path.join(ROOT, ".github", "workflows", "studio-web.yml"), "w", encoding="utf-8").write(head + jobs)
print("wrote .github/workflows/studio-web.yml")
