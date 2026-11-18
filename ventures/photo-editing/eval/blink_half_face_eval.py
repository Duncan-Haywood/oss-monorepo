#!/usr/bin/env python3
"""Half faces made from whole ones: does the edge-mirror view read the lids the same?

For every prominent face (1% of the frame or more) that the landmark detector reads in a photo
of the 105-photo set (eval/blink_landmarker_eval.py), the photo is cut through the middle of
that face, once keeping the left part and once the right, so the face meets the new frame edge
at its centre. The cut frame then runs through the detector with and without edge-mirror views.
Reference: the whole face's own eyes_open in the uncut photo.

    SHOOTFLOW_FACE_LANDMARKER=face_landmarker.task \\
      python eval/blink_half_face_eval.py /tmp/eps/sample-photos > rows.jsonl
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from blink_landmarker_eval import label, load_tool  # noqa: E402

PROMINENT = 0.01


def main(argv: list[str]) -> int:
    import cv2

    folder = Path(argv[1])
    model = os.environ["SHOOTFLOW_FACE_LANDMARKER"]
    tool = load_tool("mediapipe_face_detector")
    names = sorted(p.name for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".png"})
    with tempfile.TemporaryDirectory() as tmp:
        for name in names:
            whole = tool.detect(str(folder / name), model)
            faces = [f for f in whole["faces"] if f["size"] >= PROMINENT and f["eyes_open"] is not None and not f.get("edge")]
            if not faces:
                continue
            image = cv2.imread(str(folder / name), cv2.IMREAD_COLOR)
            for index, face in enumerate(faces):
                x0, y0, x1, y1 = face["box"]
                cut = round((x0 + x1) / 2)
                for keep, crop in (("left", image[:, :cut]), ("right", image[:, cut:])):
                    if crop.shape[1] < 32:
                        continue
                    path = Path(tmp) / f"{index}-{keep}.png"
                    cv2.imwrite(str(path), crop)
                    for mirror in (False, True):
                        found = tool.detect(str(path), model, edge_mirror=mirror)["faces"]
                        # the cut face: a face touching the cut edge and overlapping the face's rows
                        edge_x = crop.shape[1] if keep == "left" else 0
                        hits = [f for f in found if abs((f["box"][2] if keep == "left" else f["box"][0]) - edge_x) <= 0.15 * (x1 - x0)
                                and min(y1, f["box"][3]) - max(y0, f["box"][1]) > 0.5 * (y1 - y0)]
                        hit = max(hits, key=lambda f: f["size"]) if hits else None
                        print(json.dumps({
                            "photo": name, "label": label(name), "face": index, "box": face["box"],
                            "whole_eyes_open": face["eyes_open"], "whole_blink": face["blink"],
                            "kept": keep, "edge_mirror": mirror,
                            "found": hit is not None,
                            "eyes_open": hit["eyes_open"] if hit else None,
                            "blink": hit["blink"] if hit else None,
                            "size": hit["size"] if hit else None,
                            "via_edge": bool(hit and hit.get("edge")),
                        }), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
