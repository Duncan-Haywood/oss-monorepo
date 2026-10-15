import numpy as np

from simdesign_pricebands import BASE, NAMES, SUBSETS, best, flip_rate, price_draws, subset_values
from simdesign_flipseeds import choice
from simdesign_coverweight.weighted import sample_parts


def test_nominal_matches_flipseeds_choice():
    p = sample_parts(3000, 5, "log", load=True)
    v = subset_values("log", 5, n=3000)
    for b in (300, 600, 800, 1100):
        for mode in ("count", "mass"):
            ch, val = choice(p, mode, b)
            k = best(v[mode], BASE, b)
            assert tuple(sorted(NAMES[i] for i in SUBSETS[k])) == ch
            assert abs(v[mode][k] - val) < 1e-12


def test_best_is_affordable_and_zero_budget_empty():
    v = subset_values("small", 1, n=1000)
    assert SUBSETS[best(v["mass"], BASE, 0)] == ()
    for b in (300, 700, 1700):
        assert sum(BASE[i] for i in SUBSETS[best(v["count"], BASE, b)]) <= b


def test_draws_within_spread_and_reproducible():
    a = price_draws(50, 0.2, np.random.default_rng(1)); b = price_draws(50, 0.2, np.random.default_rng(1))
    assert (a == b).all() and ((a >= 0.8 * BASE - 1e-9) & (a <= 1.2 * BASE + 1e-9)).all()


def test_zero_spread_reproduces_nominal_flip():
    v = subset_values("log", 5, n=3000)
    pr = price_draws(5, 0.0, np.random.default_rng(0))
    assert flip_rate(v, pr, 700) == (1.0, 1.0)  # log flips at nominal 700 (flipseeds); loss ~2 points > 0.5
    assert flip_rate(v, pr, 300) == (0.0, 0.0)


def test_material_flips_are_subset_of_flips():
    v = subset_values("large", 6, n=2000)
    pr = price_draws(30, 0.2, np.random.default_rng(2))
    a, m = flip_rate(v, pr, 800)
    assert 0 <= m <= a <= 1
