import importlib.util
import math
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("tail_rule_test", os.path.join(HERE, "tail_rule.py"))
tr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tr)
spec2 = importlib.util.spec_from_file_location("tail_rule_posthoc_test", os.path.join(HERE, "tail_rule_posthoc.py"))
ph = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(ph)


def _row(idx, leak, cost, m=12):
    return {"m": m, "idx": idx, "s": "2.0", "k_aware": 0, "leak": leak, "cost": cost}


# leak curve with a cliff between 3 and 4 bands; best plan at 3, budget 0.05 picks 5
CLIFF = _row(0, {1: 0.0, 2: 0.0, 3: 1e-7, 4: 0.04, 5: 0.04, 6: 0.15, 7: 0.2},
             {1: 2.4, 2: 1.1, 3: 1.0, 4: 1.6, 5: 1.5, 6: 1.6, 7: 2.4})


def test_wide_and_narrow_spacing_sets_clip_at_the_ends():
    assert tr.spacings_N(CLIFF, 0.05) == [4, 5, 6]
    assert tr.spacings_W(CLIFF, 0.05) == [3, 4, 5, 6, 7]
    x = _row(0, {1: 0.0, 2: 0.5}, {1: 1.0, 2: 1.0})
    assert tr.spacings_W(x, 0.01) == [1, 2]          # k_B = 1


def test_flatness_refuses_the_cliff_and_wide_search_crosses_it():
    ext = dict(tr.extensions(CLIFF, 0.05))
    assert math.isclose(ext[3], math.log(0.04 / 1e-6))   # leak floored at EPS
    assert tr.spacings_A(CLIFF, 0.05, 1.0) == [4, 5, 6]  # neither side is flat
    assert tr.cost(CLIFF, tr.spacings_A(CLIFF, 0.05, 1e6)) == 1.0
    assert tr.cost(CLIFF, tr.spacings_W(CLIFF, 0.05)) == 1.0


def test_calibrate_r_respects_the_effort_cap():
    rows = [CLIFF]
    # extending both sides costs 250 descents > 200, so no r above the cliff ratio is allowed
    r = tr.calibrate_r(rows, [0.05], grid=(1.0, 10.0, 1e6), cap=200)
    assert r == 1.0
    r = tr.calibrate_r(rows, [0.05], grid=(1.0, 10.0, 1e6), cap=250)
    assert r == 1e6


def test_posthoc_cliff_rule_adds_the_safety_budget_band_count():
    assert ph.spacings_C(CLIFF, 0.05, 1e-4) == [4, 5, 6, 3]
    assert ph.spacings_C(CLIFF, 0.05, 1e-4, wide=True) == [4, 5, 6, 2, 3]
