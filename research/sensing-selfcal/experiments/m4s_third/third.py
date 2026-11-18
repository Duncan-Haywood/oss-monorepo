"""Milestone 4s: load a TUM unit's third pool of 13 views (corners_<unit>c.json, prepare.py).

Extends milestone 4p's fresh.load (pools A = fr1/fr3, B = fr1b/fr3b) to pool C (fr1c, fr3c) and
points milestone 4q's tilts and milestone 4p's load_sols at C's files, so milestone 4r's code runs on
all three pools unchanged.
"""
import importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m4p_fresh"))
import fresh  # noqa: E402

tu = fresh.tu
THIRD = ("fr1c", "fr3c")
_load_ab = fresh.load


def corners(unit):
    with open(os.path.join(HERE, f"corners_{unit}.json")) as fh:
        return json.load(fh)


def load(unit):
    """(obs (13, 48, 2), size, names) for pool A, B or C of a TUM unit."""
    if unit not in THIRD:
        return _load_ab(unit)
    d = corners(unit)
    assert tuple(d["pattern"]) == tu.PATTERN
    return np.array([v["corners"] for v in d["views"]], float), tuple(d["size"]), [v["name"] for v in d["views"]]


def f0(unit):
    """Milestone 4j's cold start on this pool's own views: 1.3x the k1 Zhang f."""
    obs, size, _ = load(unit)
    return tu.INIT_FACTOR * tu.sc.zhang(list(obs), size, k2=False)["f"]


def patch(m4r):
    """Point milestone 4r's imported modules (4p, 4q) at pool C as well as A and B."""
    m4p, m4q = m4r.m4p, m4r.m4q
    fresh.load = load
    m4p.fresh.load = load
    m4p.RESULTS["C"] = os.path.join(HERE, "results.json.gz")
    for u in m4p.UNITS:
        m4p.POOL[("C", u)] = u + "c"
    tilts_ab = m4q.tilts

    def tilts(cam):
        if cam in THIRD:
            return np.array([v["tilt"] for v in corners(cam)["views"]], float)
        return tilts_ab(cam)
    m4q.tilts = tilts
