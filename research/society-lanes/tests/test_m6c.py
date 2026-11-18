"""Tests for milestone 6c's cells, control counts and effect arithmetic (experiments/m6c_lane_seeds.py)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import m6c_lane_seeds as M  # noqa: E402
import m5_robots as M5  # noqa: E402


def test_job_count():
    assert len(M.jobs()) == len(M.MULTS) * len(M.RUNS) * (1 + len(M.SHARES) * len(M.CONDS)) * M.SEEDS


def test_control_matches_robot_cells_people_count():
    for n in (30, 60):
        for sh in M.SHARES:
            na_c, nr_c = M.agents(n, "control", sh)
            na_r, nr_r = M.agents(n, "crowd", sh)
            assert nr_c == 0 and na_c == na_r - nr_r and nr_r == M5.n_robots(n, sh)
    assert M.agents(30, "none", 0.0) == (30, 0)


def test_fresh_seeds_disjoint_from_earlier_milestones():
    import m6a_h5_closepass as M6A
    new = {j[-1] for j in M.jobs()}
    old = set(range(M5.SEED0, M5.SEED0 + M5.SEEDS)) | set(range(M6A.SEED0, M6A.SEED0 + 20))
    assert not new & old and len(new) == M.SEEDS


def test_effects_arithmetic_and_failed_runs_dropped():
    c = M.cell_means([dict(transit=5.0, lane=0.8, share=0.7, failed=0),
                      dict(transit=99.0, lane=0.0, share=0.0, failed=1)])
    assert c["transit"] == 5.0 and c["ok"] == 1
    pt = {(0.5, "none", 0.0): dict(transit=6.0, lane=0.7, share=0.8),
          (0.5, "control", 0.2): dict(transit=5.5, lane=0.75, share=0.8),
          (0.5, "crowd", 0.2): dict(transit=5.0, lane=0.9, share=0.85),
          (0.5, "opposite", 0.2): dict(transit=7.0, lane=0.6, share=0.7)}
    e = M.effects(pt, 0.5, 0.2)
    assert e[("seed", "transit")] == pytest.approx(-0.5)
    assert e[("density", "transit")] == pytest.approx(-0.5)
    assert e[("total", "transit")] == pytest.approx(-1.0)
    assert e[("opp", "lane")] == pytest.approx(-0.15)
