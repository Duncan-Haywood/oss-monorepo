"""Milestone 3zh probe: one OpenCV release's undistortPoints at the corners of milestone 3zf's calibrations.

    <venv with opencv-python-headless==X and numpy>/bin/python experiments/m3zh_versions/probe.py --work DIR

Writes DIR/opencv-<version>.json: the normalised output at the four corner pixels of every distinct
calibration with non-zero distortion, under milestone 3zg's 13 criteria. Needs only numpy and cv2, so it
runs in a bare venv per wheel. Plan: LOG.md, "Milestone 3zh planned".
"""
import argparse
import importlib.util
import json
import os
import sys

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
COUNT, EPS = 1, 2
COUNTS = (5, 10, 20, 50, 100, 200)
CRITERIA = [("default", None)] + [(f"count{n}", (COUNT, n, 0.0)) for n in COUNTS] + \
           [(f"eps{n}", (COUNT | EPS, n, 1e-12)) for n in COUNTS]


def load_groups():
    sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
    spec = importlib.util.spec_from_file_location("m3zf_analyse", os.path.join(HERE, "..", "m3zf_ros", "analyse.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    d = json.load(open(os.path.join(HERE, "..", "m3zf_ros", "calibs.json")))
    cams = [c for c in d["cameras"] if not all(x == 0 for x in c["D"])]
    return m.distinct(cams), m.is_duckiebot, m._m3ze.corners


def KD(c):
    K = np.array([[c["fx"], 0, c["cx"]], [0, c["fy"], c["cy"]], [0, 0, 1]], dtype=np.float64)
    D = np.array([c[k] for k in ("k1", "k2", "p1", "p2", "k3")], dtype=np.float64)
    return K, D


def und_iter(p, K, D, crit):
    """undistortPoints with a criterion: a keyword in 5.x; undistortPointsIter (R, P empty) in 4.x."""
    try:
        return cv2.undistortPoints(p, K, D, criteria=crit)
    except cv2.error:
        return cv2.undistortPointsIter(p, K, D, None, None, crit)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    a = ap.parse_args()
    groups, is_duckiebot, corners = load_groups()
    out = dict(opencv=cv2.__version__, criteria=[n for n, _ in CRITERIA], calibrations=[])
    for g in groups:
        c = g["cam"]
        K, D = KD(c)
        p = corners(c["width"], c["height"]).reshape(-1, 1, 2)
        res = {}
        for name, crit in CRITERIA:
            o = cv2.undistortPoints(p, K, D) if crit is None else und_iter(p, K, D, crit)
            res[name] = o.reshape(-1, 2).tolist()
        out["calibrations"].append(dict(source=g["sources"][0], out=res))
    os.makedirs(a.work, exist_ok=True)
    path = os.path.join(a.work, f"opencv-{cv2.__version__}.json")
    json.dump(out, open(path, "w"))
    print(path, len(out["calibrations"]))


if __name__ == "__main__":
    main()
