"""Tests for milestone 6d's arms, counts, seeds and effect arithmetic (experiments/m6d_lane_test.py)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import m6d_lane_test as M  # noqa: E402
import m5_robots as M5  # noqa: E402


def test_job_count():
    n_fm = sum(len(ms) for _, ms in M.FAMS.values())
    assert len(M.jobs()) == n_fm * len(M5.RUNS) * (1 + len(M.SHARES) * len(M.CONDS)) * M.SEEDS


def test_goal_arm_has_the_same_bodies_as_crowd_and_control_the_same_people():
    for n in (20, 30, 60):
        for sh in M.SHARES:
            assert M.agents(n, "goal", sh) == M.agents(n, "crowd", sh)
            na, nr = M.agents(n, "crowd", sh)
            assert M.agents(n, "control", sh) == (na - nr, 0) and nr == M5.n_robots(n, sh)
    pols = {(j[0].split("|")[4], j[6]) for j in M.jobs()}
    assert ("goal", "goal") in pols and ("crowd", "crowd") in pols


def test_fresh_seeds_disjoint_from_earlier_milestones():
    import m6a_h5_closepass as M6A
    import m6c_lane_seeds as M6C
    new = {j[-1] for j in M.jobs()}
    old = (set(range(M5.SEED0, M5.SEED0 + M5.SEEDS)) | set(range(M6A.SEED0, M6A.SEED0 + 20))
           | set(range(M6C.SEED0, M6C.SEED0 + 20)) | set(range(20290000, 20290020)))
    assert not new & old and len(new) == M.SEEDS


def test_effects_decompose():
    pt = {("sf", 0.5, "none", 0.0): dict(transit=6.0, lane=0.70, share=0.8),
          ("sf", 0.5, "control", 0.2): dict(transit=5.5, lane=0.75, share=0.8),
          ("sf", 0.5, "crowd", 0.2): dict(transit=5.0, lane=0.90, share=0.85),
          ("sf", 0.5, "goal", 0.2): dict(transit=5.8, lane=0.72, share=0.78)}
    e = M.effects(pt, "sf", 0.5, 0.2)
    assert e[("seed", "lane")] == pytest.approx(e[("side", "lane")] + e[("body", "lane")])
    assert e[("side", "lane")] == pytest.approx(0.18)
    assert e[("density", "transit")] == pytest.approx(-0.5)
