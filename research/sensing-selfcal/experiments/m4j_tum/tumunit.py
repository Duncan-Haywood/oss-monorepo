"""Milestone 4j: load a TUM RGB-D unit's 13 stored views and point selfcal at its 8x6 board.

selfcal.py was written for OpenCV's 9x6 board; its solver works for any number of corners, but
board_points, planarity and robust_sf's grid code default to that pattern. Importing this module
re-points those defaults at the TUM board (8x6 inner corners), so the unchanged solver runs here.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
import selfcal as sc  # noqa: E402

PATTERN = (8, 6)
NPT = PATTERN[0] * PATTERN[1]
UNITS = ("fr1", "fr3")
OTHER = {"fr1": "fr3", "fr3": "fr1"}
INIT_FACTOR = 1.3     # milestone 4's start: 1.3x the k1 Zhang f
# TUM's published calibration of each unit's RGB camera (file_formats page of the benchmark):
# fx, fy, cx, cy, d0..d4. fr3's images come already undistorted (all d zero).
TUM_CALIB = {"fr1": (517.3, 516.5, 318.6, 255.3, 0.2624, -0.9531, -0.0054, 0.0026, 1.1633),
             "fr3": (535.4, 539.2, 320.1, 247.6, 0.0, 0.0, 0.0, 0.0, 0.0)}

sc.PATTERN = PATTERN
sc.board_points.__defaults__ = (PATTERN, 1.0)
sc.planarity.__defaults__ = (PATTERN,)


def load(unit):
    """(obs (13, 48, 2), size (w, h), names) from corners_<unit>.json (prepare.py)."""
    with open(os.path.join(HERE, f"corners_{unit}.json")) as fh:
        d = json.load(fh)
    assert tuple(d["pattern"]) == PATTERN
    obs = np.array([v["corners"] for v in d["views"]], float)
    return obs, tuple(d["size"]), [v["name"] for v in d["views"]]


def f0(unit):
    obs, size, _ = load(unit)
    return INIT_FACTOR * sc.zhang(list(obs), size, k2=False)["f"]
