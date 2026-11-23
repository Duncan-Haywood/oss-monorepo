"""Milestone 7al: the stored offset sweep matches 7ak at its shared points, and the scaled offsets stay on fixed rays."""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_cant import poshold as P  # noqa: E402


def _results():
    return json.load(open(os.path.join(EXP, "m7al_roa", "results.json")))


def test_shared_points_match_7ak():
    k = json.load(open(os.path.join(EXP, "m7ak_excite", "results.json")))
    k = {(r["arm"], r["set"]): np.array(r["dead"]) for r in k["runs"]}
    for r in _results()["runs"]:
        if r["cap"]:
            continue
        if r["s"] == 1.0:
            assert np.array_equal(np.array(r["dead"]), k[(r["arm"], r["set"])])
        if r["s"] == 0.02 and r["arm"] == "quiet+O":
            assert np.array_equal(np.array(r["dead"]), k[("quiet", r["set"])])


def test_offset_scales_along_a_ray():
    old = P.OFFSET
    try:
        a = P.reference(4, 9999, 40)[5]
        P.OFFSET = old * 0.3
        b = P.reference(4, 9999, 40)[5]
    finally:
        P.OFFSET = old
    assert np.allclose(b, 0.3 * a)


def test_cap_flattens_retrained_deaths():
    d = {(r["arm"], r["set"], r["s"], r["cap"]): int(np.sum(r["dead"])) for r in _results()["runs"]}
    assert d[("full", "retrained", 2.0, False)] > 200
    assert d[("full", "retrained", 2.0, True)] <= d[("full", "retrained", 1.0, False)]
