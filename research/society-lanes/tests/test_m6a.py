"""Tests for milestone 6a's pooling and seed lists (experiments/m6a_h5_closepass.py); numpy only."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import m6a_h5_closepass as M  # noqa: E402
import m5_robots as M5  # noqa: E402


def _r(close, passes, transit=5.0, transits=10, failed=0):
    return dict(rp_close=close, rp_passes=passes, transit=transit, transits=transits, lane=0.9, share=0.8,
                pp_close=0.1, pp_passes=4, failed=failed)


def test_close_rate_is_pass_weighted_over_runs():
    a = M.cell_stats([_r(0.5, 10), _r(0.0, 30)], 4.0)
    b = M.cell_stats([_r(1.0, 10, failed=1)], 4.0)   # failed seed ignored
    p = M.pooled([a, b])
    assert p["rp_close"] == pytest.approx(5.0 / 40)
    assert p["delay_per_pass"] == pytest.approx((1.0 * 10 + 1.0 * 10) / 40)


def test_no_passes_gives_nan():
    p = M.pooled([M.cell_stats([_r(float("nan"), 0)], 4.0)])
    assert p["rp_close"] != p["rp_close"]


def test_fresh_seeds_disjoint_from_milestone_5():
    old = set(range(M5.SEED0, M5.SEED0 + M5.SEEDS))
    new = {j[-1] for j in M.jobs()}
    assert not old & new and len(new) == M.SEEDS


def test_job_count_and_half_bias():
    js = M.jobs()
    assert len(js) == 2 * 3 * 2 * 13 * M.SEEDS
    betas = {(j[0].split("|")[0], j[1]): j[4] for j in js}
    for f, b in M.FITTED.items():
        assert betas[("weak", f)] == pytest.approx(b / 2) and betas[("fitted", f)] == pytest.approx(b)
