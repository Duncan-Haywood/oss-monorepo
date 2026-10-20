import pytest

from simdesign_flipseeds import MACHINES, choice, flip_stats, wilson
from simdesign_coverweight.weighted import sample_parts


def test_wilson_bounds():
    lo, hi = wilson(0, 20)
    assert lo == 0.0 and 0.1 < hi < 0.2
    lo, hi = wilson(20, 20)
    assert hi == 1.0 and 0.8 < lo < 1.0
    lo, hi = wilson(10, 20)
    assert lo < 0.5 < hi and wilson(0, 0) == (0.0, 1.0)


def test_choice_respects_budget():
    p = sample_parts(2000, 0, "log", load=True)
    for b in (0, 300, 600, 1700):
        ch, v = choice(p, "mass", b)
        assert sum(MACHINES[m][1] for m in ch) <= b and 0 <= v <= 1


def test_zero_budget_never_flips():
    r = flip_stats("log", 0, range(3), n=1000)
    assert r["flips"] == 0 and all(x == 0 for x in r["loss"])


def test_loss_nonnegative():
    r = flip_stats("large", 800, range(3), n=2000)
    assert all(x >= -1e-12 for x in r["loss"])  # mass choice is optimal under mass weighting


def test_flips_counted_against_pairs():
    r = flip_stats("log", 700, range(4), n=2000)
    assert r["flips"] == sum(c for (a, b), c in r["pairs"].items() if a != b)
