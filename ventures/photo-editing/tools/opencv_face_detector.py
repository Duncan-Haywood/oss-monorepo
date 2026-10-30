#!/usr/bin/env python3
"""Reference detector for ShootFlow's SHOOTFLOW_FACE_DETECTOR contract (OpenCV Haar cascades).

    pip install "opencv-python-headless<5"   # 5.x moved the cascade classifier out
    export SHOOTFLOW_FACE_DETECTOR="python3 tools/opencv_face_detector.py"

Prints {"faces": [{"size": share_of_frame, "eyes_open": 0..1 or null}]}. Runs on the
photographer's machine; nothing is uploaded. This is a classical detector, not a trained
blink classifier: ``eyes_open`` comes from whether the eye cascade (trained on open eyes)
finds eyes in the upper half of a frontal face. Two found reads 0.95, one 0.5, none 0.1.
A face under MIN_EYE_FACE_PX wide gets null, since the cascade cannot judge it. Sunglasses,
heavy shadow and strong head turns also read as "none", so expect false blinks there.
"""

from __future__ import annotations

import json
import sys

MIN_EYE_FACE_PX = 70
MAX_SIDE = 1600  # long edge the image is shrunk to before detection


def eyes_open_score(eyes_found: int) -> float:
    return {0: 0.1, 1: 0.5}.get(eyes_found, 0.95)


def detect(path: str) -> dict:
    import cv2

    image = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise SystemExit(f"cannot read {path}")
    height, width = image.shape
    scale = min(1.0, MAX_SIDE / max(height, width))
    if scale < 1.0:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        height, width = image.shape
    image = cv2.equalizeHist(image)
    cascades = cv2.data.haarcascades
    face_model = cv2.CascadeClassifier(cascades + "haarcascade_frontalface_default.xml")
    eye_model = cv2.CascadeClassifier(cascades + "haarcascade_eye_tree_eyeglasses.xml")
    boxes = face_model.detectMultiScale(image, scaleFactor=1.1, minNeighbors=6, minSize=(24, 24))
    faces = []
    for x, y, w, h in boxes:
        entry = {"size": round(float(min(1.0, (w * h) / (width * height))), 5), "eyes_open": None}
        if w >= MIN_EYE_FACE_PX:
            band = image[y : y + int(h * 0.62), x : x + w]
            eyes = eye_model.detectMultiScale(
                band, scaleFactor=1.1, minNeighbors=4, minSize=(max(8, w // 10), max(8, w // 10))
            )
            entry["eyes_open"] = eyes_open_score(min(len(eyes), 2))
        faces.append(entry)
    return {"faces": faces}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: opencv_face_detector.py IMAGE", file=sys.stderr)
        return 2
    print(json.dumps(detect(argv[1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
