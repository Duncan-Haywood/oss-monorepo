"""Tests for milestone 6e's arms, counts, seeds and effect arithmetic (experiments/m6e_orca_speed.py)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import m6e_orca_speed as M  # noqa: E402
import m5_robots as M5  # noqa: E402


def test_job_count_is_the_registered_3040_at_40_seeds():
    n = sum(len(M.MULTS[f]) * len(M5.RUNS) * len(M.conds(f)) for f in M.MULTS)
    assert n == 76
    assert len(M.jobs()) == n * M.SEEDS


def test_goal_arm_has_the_same_bodies_and_speed_as_crowd():
    by = {}
    for j in M.jobs():
        fam, m, run, n, c, sh, v, s = j[0].split("|")
        by[(fam, m, run, sh, v, s, c)] = j
    for (fam, m, run, sh, v, s, c), j in by.items():
        if c == "crowd":
            g = by[(fam, m, run, sh, v, s, "goal")]
            assert (g[3], g[5], g[7], g[8]) == (j[3], j[5], j[7], j[8]) and g[6] == "goal"
            ctl = by[(fam, m, run, sh, "0.0", s, "control")]
            assert ctl[3] == j[3] - j[5] and ctl[5] == 0


def test_cfsm_sweeps_speed_and_orca_does_not():
    sp = {(j[1], j[7]) for j in M.jobs() if j[5]}
    assert {v for f, v in sp if f == "cfsm"} == {0.8, 1.2, 1.6, 2.0}
    assert {v for f, v in sp if f == "orca"} == {1.2}


def test_fresh_seeds_disjoint_from_earlier_milestones_and_calibration():
    import m6d_lane_test as M6D
    new = {j[-1] for j in M.jobs()}
    old = (set(range(M6D.SEED0, M6D.SEED0 + M6D.FULL_SEEDS)) | set(range(M5.SEED0, M5.SEED0 + M5.SEEDS))
           | set(range(M.CALIB_SEED0, M.CALIB_SEED0 + M.CALIB_SEEDS)))
    assert not new & old and len(new) == M.SEEDS


def test_effects_decompose():
    pt = {("orca", 0.02, "none", 0.0, 0.0): dict(transit=10.0, lane=0.78, share=0.68),
          ("orca", 0.02, "control", 0.2, 0.0): dict(transit=9.5, lane=0.80, share=0.70),
          ("orca", 0.02, "crowd", 0.2, 1.2): dict(transit=9.0, lane=0.90, share=0.80),
          ("orca", 0.02, "goal", 0.2, 1.2): dict(transit=11.0, lane=0.70, share=0.66)}
    e = M.effects(pt, "orca", 0.02, 0.2, 1.2)
    assert e[("seed", "transit")] == pytest.approx(e[("side", "transit")] + e[("body", "transit")])
    assert e[("side", "lane")] == pytest.approx(0.20)
    assert e[("density", "transit")] == pytest.approx(-0.5)
