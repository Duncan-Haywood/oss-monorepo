import importlib.util
import math
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1] / "experiments" / "location"
spec = importlib.util.spec_from_file_location("location_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_features():
    assert run.feature(1.0, "log") == 0.0
    assert run.feature(-0.2, "log") == pytest.approx(-math.log(run.R_FLOOR))
    assert run.feature(0.5, "quad") == 0.25
    assert run.feature(0.1, "flag") == 1.0 and run.feature(0.11, "flag") == 0.0
    assert run.feature(0.3, "none") == 0.0


def test_r_upto_uses_first_n_cycles_and_zero_on_failure():
    row = dict(ok=True, r_cycle=[0.5, 0.4, 0.2])
    assert run.r_upto(row, 2) == 0.4
    assert run.r_upto(row, 3) == 0.2
    assert run.r_upto(row, 4) == 0.0
    assert run.r_upto(dict(ok=False, r_cycle=[]), 2) == 0.0


def test_location_formula_reduces_to_part_2a():
    avg = importlib.util.spec_from_file_location("avg", HERE.parent / "average" / "run.py")
    a = importlib.util.module_from_spec(avg)
    avg.loader.exec_module(a)
    rng = np.random.default_rng(1)
    f = rng.uniform(80, 160, 30)
    assert run.expected_calls_loc(f, f, 5.0) == pytest.approx(a.expected_calls_gauss(f, 5.0), rel=1e-9)


def test_location_formula_matches_monte_carlo():
    rng = np.random.default_rng(2)
    f = rng.uniform(80, 160, 30)
    m = f - 20 * (rng.random(30) < 0.3)          # some designs pulled down, as salt depletion does
    sigma = 4.0
    thr = 0.99 * f.max()

    def one():
        order = np.argsort(-(m + rng.normal(0, sigma, len(f))), kind="stable")
        return int(np.argmax(f[order] >= thr)) + 1

    mc = np.mean([one() for _ in range(20000)])
    assert run.expected_calls_loc(f, m, sigma) == pytest.approx(mc, rel=0.03)


def test_noiseless_location_counts_outranking_outsiders():
    f = [100.0, 150.0, 120.0]
    m = [100.0, 90.0, 120.0]       # the best design is pulled below two others
    assert run.expected_calls_loc(f, m, 0.0) == 3.0


def test_online_order_finds_hidden_best_when_correction_is_exact():
    # f = s + 10 g exactly: once 4 points pin a, b, beta, the depleted best design jumps the queue
    s = [100, 98, 96, 94, 92, 90, 60]
    g = [0, 0.1, 0.0, 0.2, 0.0, 0.1, 6.0]
    f = [si + 10 * gi for si, gi in zip(s, g)]
    order = run.online_order(list(range(7)), s, g, f, "log")
    assert order[:4] == [0, 1, 2, 3]
    assert order[4] == 6
    assert sorted(order) == list(range(7))


def test_online_order_without_feature_is_screen_order_when_slope_positive():
    s = [5.0, 3.0, 9.0, 1.0, 7.0, 2.0]
    f = [2 * v + 1 for v in s]
    assert run.online_order(list(range(6)), s, [0.0] * 6, f, "none") == sorted(range(6), key=lambda i: -s[i])


def test_cv_rmse_zero_for_exact_model():
    rng = np.random.default_rng(0)
    s = rng.uniform(0, 100, 40)
    g = rng.uniform(0, 3, 40)
    f = 5 + 0.8 * s + 7 * g
    folds = [np.arange(k, 40, 5) for k in range(5)]
    assert run.cv_rmse(s, g, f, "log", folds) == pytest.approx(0.0, abs=1e-8)
    assert run.cv_rmse(s, g, f, "none", folds) > 1.0
