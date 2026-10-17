import numpy as np
import pytest
from garment_stackopt.opt import *


def test_baseline_has_small_penalty_free_objective_finite():
    d = baseline_stack(620, 3)
    c = colour(d)
    v, pen = objective(d, c[4])
    assert np.isfinite(v) and pen == 0.0 and c[3] > C_MIN


def test_shift_zero_for_angle_independent_stack():
    # no layers' worth of angle dependence: bare-substrate-like 1-layer of tiny thickness
    assert shift(np.array([D_MIN])) < 2.0


def test_budget_counts_and_stops():
    f = Budget(0.0, 5)
    rng = np.random.default_rng(0)
    random_search(f, 4, rng)
    assert f.n == 5 and np.isfinite(f.best)


def test_hue_diff_wraps():
    assert hue_diff(359, 1) == pytest.approx(2)


@pytest.mark.parametrize("name", list(OPTIMISERS))
def test_optimiser_respects_budget_and_bounds(name):
    f = Budget(30.0, 60)
    OPTIMISERS[name](f, 4, np.random.default_rng(1))
    assert f.n == 60 and np.all(f.bestx >= D_MIN) and np.all(f.bestx <= D_MAX)
