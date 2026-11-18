"""Milestone 4p: load a TUM unit's fresh 13 views (corners_<unit>b.json, prepare.py).

Uses milestone 4j's tumunit (its private selfcal pointed at the 8x6 board) for everything else.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m4j_tum"))
import tumunit as tu  # noqa: E402

FRESH = ("fr1b", "fr3b")
BASE = {"fr1b": "fr1", "fr3b": "fr3"}


def load(unit):
    """(obs (13, 48, 2), size (w, h), names) for a fresh pool (fr1b, fr3b) or a 4j pool (fr1, fr3)."""
    if unit in tu.UNITS:
        return tu.load(unit)
    with open(os.path.join(HERE, f"corners_{unit}.json")) as fh:
        d = json.load(fh)
    assert tuple(d["pattern"]) == tu.PATTERN
    obs = np.array([v["corners"] for v in d["views"]], float)
    return obs, tuple(d["size"]), [v["name"] for v in d["views"]]


def f0(unit):
    """Milestone 4j's cold start on this pool's own views: 1.3x the k1 Zhang f."""
    obs, size, _ = load(unit)
    return tu.INIT_FACTOR * tu.sc.zhang(list(obs), size, k2=False)["f"]
