"""
VOICE A/B — find the best 8 s piece of ONE voice sample by EAR (no guessing).
Takes the 3 most fluent, non-overlapping 8 s pieces of voice/<name>.wav, clones the voice from each,
speaks the same Urdu test lines with each, and writes one file per piece:
    out/voiceab/<name>_A_from_12.5s.wav   (A/B/C + where the piece starts)
Listen, pick the cleanest (no 'd'/'b' at line ends), and set VOICE_REF_START["<name>.wav"] = <start>
in scripts/narrate.py.
    python scripts/voice_ab.py sabeha
"""
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
import narrate  # noqa: E402

LINES = [
    "Campus mein sab kuch hota hai, lekin kya aap ke campus par founders ban rahe hain?",
    "Agar nahi, to shayad yeh kaam aap ka hai.",
    "Cohort Zero ek global founder ecosystem hai.",
    "Yeh is saal ka sab se bada opportunity ho sakta hai!",
]


def top_windows(path, win=8.0, k=3):
    data, sr = sf.read(path)
    data = data.mean(axis=1) if data.ndim > 1 else data
    hop = int(sr * 0.05)
    frames = np.array([np.sqrt(np.mean(data[i:i + hop] ** 2) + 1e-12) for i in range(0, max(1, len(data) - hop), hop)])
    silent = frames < max(1e-4, np.percentile(frames, 60) * 0.25)
    n = int(win / 0.05)
    csum = np.concatenate([[0], np.cumsum(silent)])
    scores = csum[n:] - csum[:-n]
    order = np.argsort(scores[6:], kind="stable") + 6   # stable: A = the default piece (same tie-break as narrate)
    picks = []
    for i in order:
        t = i * 0.05
        if all(abs(t - p) >= win for p in picks):
            picks.append(t)
        if len(picks) == k:
            break
    return picks


def main(name):
    import subprocess
    import tempfile
    ref = os.path.join(os.path.dirname(__file__), "..", "voice", f"{name}.wav")
    narrate.REF = ref
    m = narrate.load_omnivoice()          # loads the model + a default prompt; replaced per piece below
    os.makedirs("out/voiceab", exist_ok=True)
    for label, start in zip("ABC", top_windows(ref)):
        clip = os.path.join(tempfile.gettempdir(), f"ab_{label}.wav")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-t", "8", "-i", ref, clip], check=True)
        narrate._omni_prompt = m.create_voice_clone_prompt(ref_audio=clip) if hasattr(m, "create_voice_clone_prompt") else clip
        parts = []
        for line in LINES:
            wav = narrate.trim(narrate.synth_omnivoice(narrate.speakable(line)))
            parts += [wav, np.zeros(int(0.6 * narrate.SR), dtype=np.float32)]
        out = f"out/voiceab/{name}_{label}_from_{start:.1f}s.wav"
        sf.write(out, np.concatenate(parts), narrate.SR)
        print(f"{label}: piece starts at {start:.1f}s -> {out}")
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(f"- **{label}**: voice piece from **{start:.1f} s** → `{os.path.basename(out)}`\n")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sabeha")
