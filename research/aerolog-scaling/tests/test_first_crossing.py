import gzip
import importlib.util
import json
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


fc = _mod("first_crossing_test", "first_crossing.py")
P = 0.02716
LEAK_1661 = {3: 1.4e-5, 4: 0.18, 5: 0.029, 6: 0.024, 7: 0.3, 8: 0.5}   # 11bd's broken Chicago draw, rounded


def test_first_crossing_stops_at_the_first_band_count_over_budget():
    assert fc.first_crossing(LEAK_1661, P) == 3
    assert fc.cv.budget_rule(LEAK_1661, P) == 6
    assert fc.first_crossing({2: 0.5, 3: 0.6}, P) == 2           # none within budget: the fewest bands


def test_first_crossing_equals_most_bands_on_a_monotone_curve():
    leak = {2: 1e-9, 3: 1e-6, 4: 0.01, 5: 0.02, 6: 0.04, 7: 0.1}
    assert fc.first_crossing(leak, P) == fc.cv.budget_rule(leak, P) == 5
    assert not fc.non_monotone(leak, 7)
    assert fc.non_monotone(LEAK_1661, 6)


def test_windows():
    x = {"leak": LEAK_1661, "cost": {k: 1.0 for k in range(1, 13)}}
    assert fc.spacings(x, P, "S6") == [4, 5, 6, 7, 8, 9]
    assert fc.spacings(x, P, "F6") == [1, 2, 3, 4, 5, 6]
    assert fc.spacings(x, P, "FU") == list(range(1, 10))
    assert fc.spacings(x, P, "oracle") == list(range(1, 13))


def test_new_sets_share_no_seed_with_any_earlier_set_or_each_other():
    assert fc.check_seeds() == set()
    assert fc.SETS["nyc"] == {12: list(range(1272, 1284)), 16: list(range(1672, 1684))}
    assert fc.SETS["chi"] == {12: list(range(1284, 1296)), 16: list(range(1684, 1696))}


def test_committed_results_have_every_layout():
    for c, path in fc.OUTS.items():
        if not os.path.exists(path):
            continue
        with gzip.open(path, "rt") as f:
            res = json.load(f)
        want = sorted((m, i) for m in fc.SETS[c] for i in fc.SETS[c][m])
        assert sorted((r["m"], r["idx"]) for r in res) == want
