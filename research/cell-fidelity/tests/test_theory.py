import importlib.util
import random
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1] / "experiments" / "theory"
spec = importlib.util.spec_from_file_location("theory_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_calls_to_target_counts_screen_order():
    f = [100.0, 150.0, 120.0, 149.0]
    s = [4, 1, 3, 2]                     # screen order 0, 2, 3, 1
    idx = list(range(4))
    assert run.screen_order(idx, s) == [0, 2, 3, 1]
    assert run.calls_to_target(idx, s, f, tau=0.01) == 3   # 149 >= 148.5
    assert run.calls_to_target(idx, s, f, tau=0.0) == 4
    assert run.top1_regret(idx, s, f) == 50.0


def test_r_bound_and_band():
    f = [100.0, 150.0, 120.0, 149.0, 140.0]
    idx = list(range(5))
    # kappa 6 -> band [138, 148.5): only 140
    assert run.r_bound(idx, f, 6.0, tau=0.01) == 2
    assert run.band_fraction(idx, f, 6.0, tau=0.01) == pytest.approx(1 / 5)
    assert run.screen_t1_bound(10, 1.0, 20.0, 0.1) == 20.0 + 10 * (1.0 + 2.0)


def test_chebyshev_exact_affine_is_zero_and_known_case():
    pytest.importorskip("scipy")
    f = [1.0, 2.0, 3.0, 4.0]
    k, u, c = run.chebyshev([2 * v + 5 for v in f], f)
    assert k == pytest.approx(0, abs=1e-8) and u == pytest.approx(0.5)
    # s constant: only u = 0 is useful, kappa = half the range of f
    k, u, _ = run.chebyshev([1.0] * 4, f)
    assert k == pytest.approx(1.5)


def test_theorem_holds_on_random_instances():
    """Bounds (i) and (ii) of THEORY.md on random screens: never violated."""
    pytest.importorskip("scipy")
    rng = random.Random(3)
    for _ in range(200):
        n = rng.randint(2, 20)
        f = [rng.uniform(50, 150) for _ in range(n)]
        s = [0.7 * v + rng.gauss(0, rng.choice([0.5, 5, 30])) for v in f]
        idx = list(range(n))
        k = run.chebyshev(s, f)[0]
        assert run.top1_regret(idx, s, f) <= 2 * k + 1e-6
        assert run.calls_to_target(idx, s, f) <= run.r_bound(idx, f, k)
        if 2 * k <= 0.01 * max(f):
            assert run.calls_to_target(idx, s, f) == 1


def test_top_set_contains_both_tops():
    f = [1.0, 5.0, 3.0, 2.0]
    s = [9, 0, 1, 2]
    S, ok = run.top_set(list(range(4)), s, f, q=0.25)
    assert S == [0, 1] and ok is False
