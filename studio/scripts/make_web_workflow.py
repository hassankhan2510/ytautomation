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
open(os.path.join(ROOT, ".github", "workflows", "studio-web.yml"), "w", encoding="utf-8").write(head + jobs)
print("wrote .github/workflows/studio-web.yml")
