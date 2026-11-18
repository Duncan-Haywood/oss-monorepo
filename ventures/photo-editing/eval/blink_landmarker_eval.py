#!/usr/bin/env python3
"""Closed-eye flags from the two reference detectors on a real, labelled photo set.

Set: the 105 CC0 / CC BY / public-domain photos in andrisgauracs/eye-photo-sorter
(`sample-photos/`, credits in `sample-photos-CREDITS.md`), not committed here:

    git clone --depth 1 https://github.com/andrisgauracs/eye-photo-sorter /tmp/eps
    SHOOTFLOW_FACE_LANDMARKER=face_landmarker.task \\
      python eval/blink_landmarker_eval.py /tmp/eps/sample-photos > rows.jsonl

Labels (CLOSED / OPEN below) were set by this session's agent looking at every photo, not by
a photographer; four of the six CLOSED photos say "closed eyes" in their Wikimedia titles.
A photo is *flagged* when ShootFlow would penalise it: a prominent face (1% of the frame or
more, `shootflow.faces`) with eyes_open under 0.5.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from shootflow.faces import parse_faces  # noqa: E402

# Every visible face has its eyes shut (the photo a culling tool should flag).
CLOSED = {
    "coffee-kitchen.jpg", "portrait-closeup.jpg", "portrait-field.jpg", "portrait-laughing.jpg",
    "portrait-lipstick.jpg", "portrait-woman-white-background.jpg",
}
# People in frame, no shut eyes visible: open eyes, sunglasses, faces turned or too small.
OPEN = {
    "portrait-smiling-woman.jpg", "office-woman-red-sweater.jpg", "doctor-tablet.jpg",
    "family-picnic-dog.jpg", "burst-friends-1.jpg", "burst-friends-2.jpg", "burst-friends-3.jpg",
    "friends-hilltop-laughing.jpg", "dinner-friends-wine.jpg", "mother-child-hug.jpg",
    "team-meeting-table.jpg", "friends-sunset-rocks.jpg", "family-beach-walk.jpg",
    "breakfast-in-bed.jpg", "restaurant-busy.jpg", "concert-crowd.jpg", "silhouettes-sunset.jpg",
    "whiteboard-sticky-notes.jpg", "phone-selfie.jpg", "beach-dusk.jpg",
}


def load_tool(name: str):
    path = HERE.parent / "tools" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def label(name: str) -> str:
    return "closed" if name in CLOSED else "open" if name in OPEN else "no_people"


def main(argv: list[str]) -> int:
    folder = Path(argv[1])
    model = os.environ["SHOOTFLOW_FACE_LANDMARKER"]
    landmarks, haar = load_tool("mediapipe_face_detector"), load_tool("opencv_face_detector")
    names = sorted(p.name for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".png"})
    for name in names:
        path = str(folder / name)
        for detector, run in (("landmarks", lambda: landmarks.detect(path, model)), ("haar", lambda: haar.detect(path))):
            payload = run()
            report = parse_faces({"faces": [{"size": f["size"], "eyes_open": f["eyes_open"]} for f in payload["faces"]]})
            worst = report.worst_eyes_open if report else None
            print(json.dumps({
                "photo": name, "label": label(name), "detector": detector,
                "faces": report.face_count if report else 0,
                "prominent": report.prominent_faces if report else 0,
                "worst_eyes_open": worst,
                "flagged": worst is not None and worst < 0.5,
                "detail": payload["faces"],
            }), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
