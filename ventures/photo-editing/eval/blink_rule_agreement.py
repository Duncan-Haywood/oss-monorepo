#!/usr/bin/env python3
"""Do the cull page and the CLI detector agree on closed eyes? Both read the same MediaPipe
Face Landmarker blend shapes (eyeBlinkLeft / eyeBlinkRight), but until 2026-11-24 they
used different rules and different searches:

- the page (site/eyes.mjs): one whole-frame pass on a copy at most 1,024 px on its long
  side, MediaPipe's default confidence (0.5); a face is closed when BOTH eyes reach 0.45;
- the CLI (tools/mediapipe_face_detector.py): the whole frame plus 2x2 and 3x3 tiles and
  mirrored edge strips at confidence 0.7, scores averaged over views; a face is closed when
  the MORE-closed eye passes 0.5 (eyes_open < 0.5).

This script takes both readings of every photo and applies both rules (and a sweep of
lines) to each, so the search and the rule are measured apart. Two labelled sets:

    git clone --depth 1 https://github.com/andrisgauracs/eye-photo-sorter /tmp/eps
    git clone --depth 1 https://github.com/Alyxion/eye-opener /tmp/eyeopener
    # MediaPipe's own test assets (Apache-2.0), as in eval/cull-closed-eyes-2026-11-24.md:
    for f in portrait.jpg portrait_small.jpg business-person.png man-woman-okay.jpg \\
             hand-woman-man.jpg mozart_square.jpg pose.jpg; do
      curl -sfL -o /tmp/pageset/$f https://storage.googleapis.com/mediapipe-assets/$f; done
    cp /tmp/eyeopener/samples/*.png /tmp/pageset/
    SHOOTFLOW_FACE_LANDMARKER=face_landmarker.task \\
      python eval/blink_rule_agreement.py /tmp/eps/sample-photos /tmp/pageset > rows.jsonl
    python eval/blink_rule_agreement.py --score rows.jsonl

Labels: the eye-photo-sorter labels are eval/blink_landmarker_eval.py's (set 2026-11-16 by
looking at every photo); in the page set only demo_group_closed.png has shut eyes.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE_LONG_SIDE = 1024
PAGE_CLOSED_AT = 0.45  # site/eyes.mjs before 2026-11-24's change
MIN_AREA = 0.01
PAGE_SET_CLOSED = {"demo_group_closed.png"}


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def page_reading(path: Path, model: str) -> list[dict]:
    """What the cull page sees: one pass, <= 1,024 px, default confidence."""

    import cv2
    import mediapipe as mp
    import numpy as np
    from mediapipe.tasks.python import BaseOptions, vision

    pixels = cv2.imread(str(path), cv2.IMREAD_COLOR)
    pixels = cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB)
    h, w = pixels.shape[:2]
    scale = min(1.0, PAGE_LONG_SIDE / max(w, h))
    if scale < 1.0:
        pixels = cv2.resize(pixels, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    options = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model), output_face_blendshapes=True,
        num_faces=20, running_mode=vision.RunningMode.IMAGE,
    )
    faces = []
    with vision.FaceLandmarker.create_from_options(options) as landmarker:
        result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(pixels)))
    for points, shapes in zip(result.face_landmarks, result.face_blendshapes):
        x0, x1 = max(0.0, min(p.x for p in points)), min(1.0, max(p.x for p in points))
        y0, y1 = max(0.0, min(p.y for p in points)), min(1.0, max(p.y for p in points))
        scores = {s.category_name: s.score for s in shapes}
        faces.append({
            "size": round(max(0.0, x1 - x0) * max(0.0, y1 - y0), 5),
            "blink": [round(scores.get("eyeBlinkLeft", 0.0), 3), round(scores.get("eyeBlinkRight", 0.0), 3)],
            "readable": True,
        })
    return faces


def cli_reading(path: Path, model: str, tool) -> list[dict]:
    out = tool.detect(str(path), model)
    return [{"size": f["size"], "blink": f["blink"], "readable": f["eyes_open"] is not None} for f in out["faces"]]


def collect(folders: list[Path]) -> int:
    model = os.environ["SHOOTFLOW_FACE_LANDMARKER"]
    tool = load(HERE.parent / "tools" / "mediapipe_face_detector.py", "mediapipe_face_detector")
    labels = load(HERE / "blink_landmarker_eval.py", "blink_landmarker_eval")
    for folder in folders:
        for path in sorted(folder.iterdir()):
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            if folder.name == "sample-photos":
                label = labels.label(path.name)
            else:
                label = "closed" if path.name in PAGE_SET_CLOSED else "open"
            row = {"set": folder.name, "photo": path.name, "label": label,
                   "page": page_reading(path, model), "cli": cli_reading(path, model, tool)}
            print(json.dumps(row), flush=True)
    return 0


def flagged(faces: list[dict], combine, line: float) -> bool:
    return any(f["size"] >= MIN_AREA and f["readable"] and combine(f["blink"]) >= line for f in faces)


def score(rows_path: Path) -> int:
    rows = [json.loads(line) for line in rows_path.read_text().splitlines() if line.strip()]
    closed = [r for r in rows if r["label"] == "closed"]
    others = [r for r in rows if r["label"] != "closed"]
    print(f"{len(rows)} photos: {len(closed)} closed, {len(others)} others "
          f"({sum(r['label'] == 'open' for r in rows)} with people)")
    rules = {"both eyes (min)": min, "either eye (max)": max, "mean of the two": lambda b: (b[0] + b[1]) / 2}
    print("\nsearch  rule              line  closed flagged  others flagged  closed found a face")
    for search in ("page", "cli"):
        for name, combine in rules.items():
            for line in (0.40, 0.45, 0.50, 0.55):
                hit = sum(flagged(r[search], combine, line) for r in closed)
                false = sum(flagged(r[search], combine, line) for r in others)
                seen = sum(any(f["size"] >= MIN_AREA for f in r[search]) for r in closed)
                print(f"{search:6}  {name:16}  {line:.2f}  {hit:>3} / {len(closed):<3}      "
                      f"{false:>3} / {len(others):<4}      {seen} / {len(closed)}")
    print("\nper prominent face: photo, search, [left, right] blink")
    for r in rows:
        if r["label"] == "other" or r["label"] == "no_people":
            continue
        for search in ("page", "cli"):
            for f in r[search]:
                if f["size"] >= MIN_AREA:
                    print(f"  {r['label']:6} {r['photo']:38} {search:4} {f['blink']} size {f['size']:.3f}"
                          f"{'' if f['readable'] else ' (too small to read)'}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--score":
        raise SystemExit(score(Path(sys.argv[2])))
    raise SystemExit(collect([Path(a) for a in sys.argv[1:]]))
