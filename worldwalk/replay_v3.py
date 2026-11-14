"""Replay the REAL Wan2.1-VACE output from Colab v3 on CPU (no GPU): feed the saved raw chunks back
through chunked_world and compare seam fixes. Usage: python replay_v3.py runs/colab/v3"""
import sys, os, json, subprocess, time
import numpy as np
os.environ.setdefault("SF_G", "12"); os.environ.setdefault("SF_LAM", "10")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shotc"))
import mv, ww

d = sys.argv[1]
F, W, H, CHUNK = 49, 384, 384, 9
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(d, "raw_model_output.mp4"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
raw = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32) / 255
chunks = [raw[i:i + CHUNK] for i in range(0, len(raw), CHUNK)]
print("raw chunks", len(chunks), raw.shape)
CAM = mv.room_path(F)
t0 = time.time(); gt_rgb, gt_z = mv.scene_truth(CAM, W, H); print(f"scene {time.time()-t0:.0f}s")
depth = ww.MonoDepth()
res = {}
modes = sys.argv[2].split(",") if len(sys.argv) > 2 else ["hard", "affine", "field"]
for blend in modes:
    it = iter(chunks)
    out, shown, back = mv.chunked_world(lambda fr, m, idx: next(it), CAM, W, H, gt_rgb, gt_z, "single", depth, chunk=CHUNK, lift="last", blend=blend)
    g = shown[F // 2:, :, W // 2:].mean(-1)
    out["stripe_dx_dy"] = float(np.abs(np.diff(g, axis=2)).mean() / np.abs(np.diff(g, axis=1)).mean())
    res[blend] = out
    print(blend, json.dumps({k: round(v, 3) if isinstance(v, float) else v for k, v in out.items()}))
    np.save(os.path.join(d, f"replay_shown_{blend}.npy"), (np.clip(shown, 0, 1) * 255).astype(np.uint8))
json.dump(res, open(os.path.join(d, "replay_v3.json"), "w"), indent=1)
# colour drift: mean RGB of the imagined side late in the walk vs the model's own raw output there
ref = raw[-9:, :, W // 2:].reshape(-1, 3).mean(0)
for b in modes:
    sh = np.load(os.path.join(d, f"replay_shown_{b}.npy"))[40:, :, W // 2:].reshape(-1, 3).mean(0) / 255
    print(f"{b:9s} late imagined mean RGB {np.round(sh, 3)} vs raw {np.round(ref, 3)} · cast (R-G, B-G) {sh[0]-sh[1]:+.3f} {sh[2]-sh[1]:+.3f}")
