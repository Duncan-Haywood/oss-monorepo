#!/usr/bin/env python3
"""Landmark-based blink detector for ShootFlow's SHOOTFLOW_FACE_DETECTOR contract.

    pip install mediapipe            # 0.10 or later; Linux also needs libEGL (apt: libegl1 libgles2)
    curl -L -o face_landmarker.task \\
      https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
    export SHOOTFLOW_FACE_LANDMARKER=$PWD/face_landmarker.task
    export SHOOTFLOW_FACE_DETECTOR="python3 tools/mediapipe_face_detector.py"

Prints {"faces": [{"size": share_of_frame, "eyes_open": 0..1 or null, ...}]}. Runs on the
photographer's machine; nothing is uploaded. Google's Face Landmarker (Apache 2.0) fits 478
landmarks per face and scores 52 blendshapes, two of which are ``eyeBlinkLeft`` and
``eyeBlinkRight``. Unlike the Haar-cascade reference (``opencv_face_detector.py``), whose eye
cascade only knows open eyes, this reads the lids themselves.

``eyes_open`` is a calibrated map of the more-closed eye's blink score (``BLINK_CLOSED_AT``,
from eval/blink-landmarker-2026-11-16.md): a blink score at the threshold reads 0.5, and the
map is steep around it, so a laughing squint (blink scores near 0.4) still reads mostly open.
The extra keys (``blink``, ``box``) are ignored by ShootFlow and kept for checking.

The landmarker's face finder is a short-range (selfie) model: it misses faces under roughly a
tenth of the frame's short side. So the frame is also searched in overlapping tiles, and a face
found twice is kept once. Faces whose landmark box is under MIN_EYE_FACE_PX wide get
``eyes_open: null``: too few pixels across the lids to judge.
"""

from __future__ import annotations

import json
import math
import os
import sys

MODEL_ENV = "SHOOTFLOW_FACE_LANDMARKER"
MIN_EYE_FACE_PX = 60
MAX_FACES = 32
# Blink score (the larger of the two eyes) at which eyes_open crosses 0.5. Calibrated on
# real photos, see eval/blink-landmarker-2026-11-16.md.
BLINK_CLOSED_AT = 0.5
BLINK_SLOPE = 14.0
TILE_GRID = (2, 3)  # tile layouts searched besides the whole frame: 2x2 and 3x3
TILE_OVERLAP = 0.25
DUPLICATE_IOU = 0.3
# Face-finder and landmark-fit confidence. MediaPipe's default (0.5) lets wheels, hands and
# blurred stage lights through as faces on real photos; see the eval note.
MIN_CONFIDENCE = 0.7


def eyes_open_from_blink(blink: float) -> float:
    """Map the more-closed eye's blink score (0 open .. 1 closed) to eyes_open (1 open .. 0)."""

    value = 1.0 / (1.0 + math.exp(BLINK_SLOPE * (blink - BLINK_CLOSED_AT)))
    return round(min(1.0, max(0.0, value)), 3)


def tiles(width: int, height: int) -> list[tuple[int, int, int, int]]:
    """Whole frame first, then overlapping tiles: (left, top, right, bottom) in pixels."""

    boxes = [(0, 0, width, height)]
    for n in TILE_GRID:
        tw, th = width / (n - (n - 1) * TILE_OVERLAP), height / (n - (n - 1) * TILE_OVERLAP)
        step_x, step_y = tw * (1 - TILE_OVERLAP), th * (1 - TILE_OVERLAP)
        for row in range(n):
            for col in range(n):
                left, top = round(col * step_x), round(row * step_y)
                boxes.append((left, top, min(width, round(left + tw)), min(height, round(top + th))))
    return boxes


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def merge_faces(found: list[dict]) -> list[dict]:
    """One entry per face. Overlapping boxes are the same face seen in several tiles: keep the
    largest box (most pixels per lid) and average the blink scores of every view, since a
    single view's score moves by up to 0.15 with the crop."""

    groups: list[list[dict]] = []
    for face in sorted(found, key=lambda f: -(f["box"][2] - f["box"][0])):
        for group in groups:
            if iou(face["box"], group[0]["box"]) >= DUPLICATE_IOU:
                group.append(face)
                break
        else:
            groups.append([face])
    kept = []
    for group in groups[:MAX_FACES]:
        best = dict(group[0])
        blink = [sum(f["blink"][i] for f in group) / len(group) for i in (0, 1)]
        best["blink"] = [round(b, 3) for b in blink]
        best["views"] = len(group)
        if best["eyes_open"] is not None:
            best["eyes_open"] = eyes_open_from_blink(max(blink))
        kept.append(best)
    return kept


def face_entry(box: tuple[float, float, float, float], blink: tuple[float, float], frame: tuple[int, int]) -> dict:
    width, height = frame
    face_w, face_h = box[2] - box[0], box[3] - box[1]
    worst = max(blink)
    return {
        "size": round(min(1.0, (face_w * face_h) / (width * height)), 5),
        "eyes_open": eyes_open_from_blink(worst) if face_w >= MIN_EYE_FACE_PX else None,
        "blink": [round(blink[0], 3), round(blink[1], 3)],
        "box": [round(v) for v in box],
    }


def detect(path: str, model: str, min_confidence: float = MIN_CONFIDENCE) -> dict:
    import mediapipe as mp
    import numpy as np
    from mediapipe.tasks.python import BaseOptions, vision

    options = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model),
        output_face_blendshapes=True,
        num_faces=MAX_FACES,
        running_mode=vision.RunningMode.IMAGE,
        min_face_detection_confidence=min_confidence,
        min_face_presence_confidence=min_confidence,
    )
    image = mp.Image.create_from_file(path)
    pixels = image.numpy_view()
    if pixels.ndim == 2:
        pixels = pixels[:, :, None]
    if pixels.shape[2] < 3:  # greyscale JPEGs: the landmarker wants three channels
        pixels = np.repeat(pixels[:, :, :1], 3, axis=2)
    pixels = np.ascontiguousarray(pixels[:, :, :3])
    height, width = pixels.shape[:2]
    found: list[dict] = []
    with vision.FaceLandmarker.create_from_options(options) as landmarker:
        for left, top, right, bottom in tiles(width, height):
            crop = np.ascontiguousarray(pixels[top:bottom, left:right])
            result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
            cw, ch = right - left, bottom - top
            for points, shapes in zip(result.face_landmarks, result.face_blendshapes):
                xs = [left + p.x * cw for p in points]
                ys = [top + p.y * ch for p in points]
                scores = {s.category_name: s.score for s in shapes}
                box = (min(xs), min(ys), max(xs), max(ys))
                blink = (scores.get("eyeBlinkLeft", 0.0), scores.get("eyeBlinkRight", 0.0))
                found.append(face_entry(box, blink, (width, height)))
    return {"faces": merge_faces(found)}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: mediapipe_face_detector.py IMAGE   (model path in $SHOOTFLOW_FACE_LANDMARKER)", file=sys.stderr)
        return 2
    model = os.environ.get(MODEL_ENV, "").strip()
    if not model or not os.path.isfile(model):
        print(f"set {MODEL_ENV} to the face_landmarker.task file (see this script's docstring)", file=sys.stderr)
        return 2
    print(json.dumps(detect(argv[1], model)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
