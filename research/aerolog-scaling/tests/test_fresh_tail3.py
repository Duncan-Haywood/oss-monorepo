import gzip
import importlib.util
import json
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("fresh_tail3_test", os.path.join(HERE, "fresh_tail3.py"))
f3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f3)


def _row(leak, cost):
    return {"m": 12, "idx": 0, "s": "2.0", "k_aware": 0, "leak": leak, "cost": cost}


# budget 0.03 picks k_B = 3; best plan 3 band counts thinner (6), which W misses and S6 and U3 reach
THIN = _row({1: 0.0, 2: 0.0, 3: 1e-7, 4: 0.04, 5: 0.06, 6: 0.09, 7: 0.15},
            {1: 2.0, 2: 1.4, 3: 1.25, 4: 1.2, 5: 1.1, 6: 1.0, 7: 1.3})
# budget 0.03 picks k_B = 5 (non-monotone leak, 11bb's layout 1246); best plan two below (3): U3 misses it
BELOW = _row({1: 0.0, 2: 0.0, 3: 6e-8, 4: 0.11, 5: 0.005, 6: 0.12, 7: 0.42},
             {1: 1.5, 2: 1.3, 3: 1.0, 4: 1.2, 5: 1.11, 6: 1.15, 7: 1.3})


def test_s6_is_the_union_of_w_and_u3():
    assert f3.spacings(THIN, 0.03, "S6") == [1, 2, 3, 4, 5, 6]
    assert f3.spacings(THIN, 0.03, "U3") == [2, 3, 4, 5, 6]
    assert f3.spacings(THIN, 0.03, "W") == [1, 2, 3, 4, 5]


def test_s6_reaches_both_sides():
    for x in (THIN, BELOW):
        assert f3.ft.cost(x, f3.spacings(x, 0.03, "S6")) == 1.0
    assert f3.ft.cost(BELOW, f3.spacings(BELOW, 0.03, "U3")) == 1.11
    assert f3.ft.cost(THIN, f3.spacings(THIN, 0.03, "W")) == 1.1


def test_third_fresh_set_shares_no_seed():
    assert f3.check_seeds() == set()
    for m in (12, 16):
        used = set(f3.ft.OLD[m]) | set(f3.FIRST[m]) | set(f3.FRESH2[m])
        assert not set(f3.FRESH3[m]) & used


def test_second_fresh_list_matches_11bb():
    spec2 = importlib.util.spec_from_file_location("fresh_tail2_t3", os.path.join(HERE, "fresh_tail2.py"))
    f2 = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(f2)
    assert f3.FRESH2 == f2.FRESH2


def test_s6_never_above_w_on_the_second_fresh_set():
    with gzip.open(os.path.join(HERE, "fresh_tail2.json.gz"), "rt") as f:
        rows = f3.cv.draws(json.load(f))
    p = 0.02716
    for x in rows:
        assert f3.ft.cost(x, f3.spacings(x, p, "S6")) <= f3.ft.cost(x, f3.spacings(x, p, "W")) + 1e-12
