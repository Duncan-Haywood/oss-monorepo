"""Milestone 7an: rollout's start_off reproduces the reference's offsets, and the stored bisection is self-consistent."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments", "m7an_bisect")


def _results():
    return json.load(open(os.path.join(EXP, "results.json")))


def test_start_off_default_is_inert():
    import sys
    sys.path.insert(0, os.path.join(HERE, "..", "src"))
    from codesign_cant import aero as A, poshold as P
    L, D = np.array([0.15, 0.2]), np.array([0.127, 0.127])
    sz = A.size(L, D, np.array([0.0, 0.2]), actuator="hover")
    g = np.tile([8.0, 0.6, 0.5, 3.0, 0.3, 0.1, 4.0, 3.0, 0.5], (2, 1))
    off = P.reference(4, 3)[5]
    a = P.rollout(sz, g, 0.0, 4, 3)
    b = P.rollout(sz, g, 0.0, 4, 3, start_off=off[None])
    assert np.allclose(a["pos"], b["pos"]) and (a["dead_ep"] == b["dead_ep"]).all()


def test_bisection_brackets():
    R = _results()
    for r in R["runs"]:
        rc, lo = np.array(r["rc"]), np.array(r["lo"])
        fin = rc > 0
        assert (lo[fin] < rc[fin]).all() and (rc[fin] - lo[fin] <= (R["r_hi"] - R["r_lo"]) / 2 ** R["halvings"] + 2e-6).all()
        assert (rc[fin] <= R["r_hi"]).all()


def test_stats_recompute_rc6():
    R = _results(); J = json.load(open(os.path.join(EXP, "stats.json")))
    q = sum(int(np.sum(r["cap_dead_3"])) for r in R["runs"] if r["arm"] == "quiet+O")
    assert J["rc6"]["quiet"] == q and len(J["designs"]) == len(R["designs"]) == 36
