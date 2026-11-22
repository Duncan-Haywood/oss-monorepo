import importlib.util
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("fresh_tail2_test", os.path.join(HERE, "fresh_tail2.py"))
f2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f2)


def _row(leak, cost):
    return {"m": 12, "idx": 0, "s": "2.0", "k_aware": 0, "leak": leak, "cost": cost}


# budget 0.03 picks k_B = 3 (the cliff's foot); the best plan is 3 band counts thinner, at 6
THIN = _row({1: 0.0, 2: 0.0, 3: 1e-7, 4: 0.04, 5: 0.06, 6: 0.09, 7: 0.15},
            {1: 2.0, 2: 1.4, 3: 1.25, 4: 1.2, 5: 1.1, 6: 1.0, 7: 1.3})


def test_one_sided_searches_cover_the_thin_side():
    assert f2.spacings(THIN, 0.03, "W") == [1, 2, 3, 4, 5]
    assert f2.spacings(THIN, 0.03, "U2") == [2, 3, 4, 5]
    assert f2.spacings(THIN, 0.03, "U3") == [2, 3, 4, 5, 6]


def test_u3_reaches_a_best_three_above_k_b_and_w_does_not():
    assert f2.ft.cost(THIN, f2.spacings(THIN, 0.03, "U3")) == 1.0
    assert f2.ft.cost(THIN, f2.spacings(THIN, 0.03, "W")) == 1.1


def test_spacings_clip_to_available_band_counts():
    x = _row({1: 0.0, 2: 0.5}, {1: 1.0, 2: 1.2})
    assert f2.spacings(x, 0.03, "U3") == [1, 2]


def test_second_fresh_set_shares_no_seed():
    assert f2.check_seeds() == set()
    for m in (12, 16):
        assert not set(f2.FRESH2[m]) & (set(f2.ft.OLD[m]) | set(f2.FIRST[m]))


def test_seed_check_is_independent_of_ft_fresh():
    saved = f2.ft.FRESH
    try:
        f2.ft.FRESH = f2.FRESH2
        assert f2.check_seeds() == set()
    finally:
        f2.ft.FRESH = saved
