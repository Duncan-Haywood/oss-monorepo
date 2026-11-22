import importlib.util
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("fresh_tail_test", os.path.join(HERE, "fresh_tail.py"))
ft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ft)


def _row(leak, cost):
    return {"m": 12, "idx": 0, "s": "2.0", "k_aware": 0, "leak": leak, "cost": cost}


# cliff between 3 and 4 bands; budget 0.05 picks 5, the best plan is 3
CLIFF = _row({1: 0.0, 2: 0.0, 3: 1e-7, 4: 0.04, 5: 0.04, 6: 0.15, 7: 0.2},
             {1: 2.4, 2: 1.1, 3: 1.0, 4: 1.6, 5: 1.5, 6: 1.6, 7: 2.4})


def test_rules_search_the_right_band_counts():
    assert ft.spacings(CLIFF, 0.05, "B") == [5]
    assert ft.spacings(CLIFF, 0.05, "N") == [4, 5, 6]
    assert ft.spacings(CLIFF, 0.05, "W") == [3, 4, 5, 6, 7]
    assert ft.spacings(CLIFF, 0.05, "C", 1e-4) == [3, 4, 5, 6]   # k_q = 3, the cliff's foot
    assert ft.spacings(CLIFF, 0.05, "oracle") == [1, 2, 3, 4, 5, 6, 7]


def test_cliff_rule_and_wide_search_both_reach_the_foot():
    assert ft.cost(CLIFF, ft.spacings(CLIFF, 0.05, "N")) == 1.5
    assert ft.cost(CLIFF, ft.spacings(CLIFF, 0.05, "C", 1e-4)) == 1.0
    assert ft.cost(CLIFF, ft.spacings(CLIFF, 0.05, "W")) == 1.0


def test_c_is_n_when_k_q_is_already_searched():
    x = _row({1: 0.0, 2: 0.0, 3: 0.002, 4: 0.03, 5: 0.1}, {1: 2.0, 2: 1.2, 3: 1.0, 4: 1.1, 5: 1.3})
    assert ft.spacings(x, 0.03, "C", 0.01) == ft.spacings(x, 0.03, "N") == [3, 4, 5]


def test_fresh_layouts_share_no_seed_with_the_old_ones():
    assert ft.check_seeds() == set()
    assert not set(ft.FRESH[12]) & set(ft.OLD[12]) and not set(ft.FRESH[16]) & set(ft.OLD[16])
