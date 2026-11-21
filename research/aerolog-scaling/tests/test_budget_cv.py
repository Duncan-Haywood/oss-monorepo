import importlib.util
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("budget_cv_test", os.path.join(HERE, "budget_cv.py"))
cv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cv)


def _row(m, idx, leak, cost):
    return {"m": m, "idx": idx, "s": "1.0", "k_aware": 0, "leak": leak, "cost": cost}


def test_dense_grid_contains_the_fixed_budgets():
    assert cv.P0 in cv.P_DENSE and cv.P_STAR in cv.P_DENSE
    assert min(cv.P_DENSE) == 1e-4 and abs(max(cv.P_DENSE) - 0.3) < 1e-12
    assert list(cv.P_DENSE) == sorted(cv.P_DENSE)


def test_neighbour_rule_takes_best_of_three_and_clips_at_the_ends():
    x = _row(12, 0, {1: 0.0, 2: 0.0, 3: 0.2}, {1: 1.5, 2: 1.1, 3: 1.0})
    assert cv.cost_B(x, 0.01) == 1.1          # k_B = 2
    assert cv.cost_N(x, 0.01) == 1.0          # 1, 2, 3 searched
    assert cv.cost_N(x, 0.5) == 1.0           # k_B = 3, k = 4 does not exist
    assert cv.cost_oracle(x) == 1.0


def test_calibrate_minimises_mean_cost_ties_to_smaller_budget():
    rows = [_row(12, 0, {3: 0.0, 4: 0.02, 5: 0.08}, {3: 1.2, 4: 1.0, 5: 1.1})]
    p = cv.calibrate(rows, cv.cost_B, grid=(0.001, 0.02, 0.05, 0.1))
    assert p == 0.02                         # 0.02 and 0.05 both give k = 4; smaller wins


def test_lolo_never_sees_the_held_out_layout():
    a = _row(12, 0, {3: 0.0, 4: 0.02}, {3: 9.0, 4: 1.0})   # wants p >= 0.02
    b = _row(12, 1, {3: 0.0, 4: 0.02}, {3: 1.0, 4: 9.0})   # wants p < 0.02
    out = cv.lolo([a, b], cv.cost_B)
    # each layout is scored with the budget its neighbour prefers, the worst case for both
    assert out[0][0] == 9.0 and out[1][0] == 9.0
