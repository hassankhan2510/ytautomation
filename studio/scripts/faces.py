"""Face detection shared by analyze_assets.py and critic.py.
YuNet (OpenCV FaceDetectorYN, MIT model, ~230 KB; path in YUNET_MODEL or models/face_detection_yunet.onnx)
is preferred; OpenCV 4's bundled Haar cascade is the fallback (OpenCV 5 removed Haar). If neither is
available, detect() returns [] and AVAILABLE is False — callers report that instead of silently passing."""
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_yunet, _haar, KIND = None, None, "none"
try:
    import cv2
    model = os.environ.get("YUNET_MODEL") or os.path.join(HERE, "..", "models", "face_detection_yunet.onnx")
    if hasattr(cv2, "FaceDetectorYN") and os.path.exists(model):
        _yunet = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.75, 0.3, 5000)
        KIND = "yunet"
    elif hasattr(cv2, "CascadeClassifier"):
        _haar = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
        if not _haar.empty():
            KIND = "haar"
except Exception:
    pass
AVAILABLE = KIND != "none"


def detect(rgb_u8, min_frac=0.04):
    """rgb uint8 [H,W,3] -> [(x, y, w, h)] in pixels of that image."""
    H, W = rgb_u8.shape[:2]
    if KIND == "yunet":
        bgr = np.ascontiguousarray(rgb_u8[..., ::-1])
        _yunet.setInputSize((W, H))
        _, f = _yunet.detect(bgr)
        if f is None:
            return []
        return [(float(r[0]), float(r[1]), float(r[2]), float(r[3])) for r in f if r[2] >= min_frac * W]
    if KIND == "haar":
        g = (rgb_u8.astype(np.float32).mean(-1)).astype(np.uint8)
        m = max(24, int(min_frac * W))
        return [tuple(map(float, r)) for r in _haar.detectMultiScale(g, scaleFactor=1.08, minNeighbors=5, minSize=(m, m))]
    return []
