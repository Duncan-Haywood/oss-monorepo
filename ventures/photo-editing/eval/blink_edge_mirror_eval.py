#!/usr/bin/env python3
"""The landmark blink detector with and without its edge-mirror views, on the same 105 photos.

Set and labels: eval/blink_landmarker_eval.py (andrisgauracs/eye-photo-sorter, not committed).

    git clone --depth 1 https://github.com/andrisgauracs/eye-photo-sorter /tmp/eps
    SHOOTFLOW_FACE_LANDMARKER=face_landmarker.task \\
      python eval/blink_edge_mirror_eval.py /tmp/eps/sample-photos > rows.jsonl

A photo is *flagged* when ShootFlow would penalise it: a prominent face (1% of the frame or
more, `shootflow.faces`) with eyes_open under 0.5.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "src"))
from blink_landmarker_eval import label, load_tool  # noqa: E402
from shootflow.faces import parse_faces  # noqa: E402


def main(argv: list[str]) -> int:
    folder = Path(argv[1])
    model = os.environ["SHOOTFLOW_FACE_LANDMARKER"]
    landmarks = load_tool("mediapipe_face_detector")
    names = sorted(p.name for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".png"})
    for name in names:
        for mirror in (False, True):
            start = time.perf_counter()
            payload = landmarks.detect(str(folder / name), model, edge_mirror=mirror)
            seconds = time.perf_counter() - start
            report = parse_faces({"faces": [{"size": f["size"], "eyes_open": f["eyes_open"]} for f in payload["faces"]]})
            worst = report.worst_eyes_open if report else None
            print(json.dumps({
                "photo": name, "label": label(name), "edge_mirror": mirror,
                "faces": report.face_count if report else 0,
                "prominent": report.prominent_faces if report else 0,
                "worst_eyes_open": worst,
                "flagged": worst is not None and worst < 0.5,
                "seconds": round(seconds, 2),
                "detail": payload["faces"],
            }), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
