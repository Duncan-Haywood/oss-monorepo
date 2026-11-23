"""Milestone 90 (experiments/arbiter_audit): audits of precision forgeries priced by audit compute."""
import importlib.util
import os

import pytest

np = pytest.importorskip("numpy")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "arbiter_audit")
_spec = importlib.util.spec_from_file_location("aa_analyze", os.path.join(EXP, "analyze.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


def _res(cal_fp16, cal_reo, test):
    """One sgd cell, 10 segments; `test` maps key -> (fp16 list, reorder list), same for every test seed."""
    runs = {}
    for s in (0, 1):
        runs[str(s)] = {"fp16": {"w": {"honest": cal_fp16[s]}}, "reorder": {"w": {"honest": cal_reo[s]}}}
    for s in (5,):
        runs[str(s)] = {"fp16": {"w": {k: v[0] for k, v in test.items()}},
                        "reorder": {"w": {k: v[1] for k, v in test.items()}}}
    for s in (0, 1):
        for k in test:
            runs[str(s)]["fp16"]["w"].setdefault(k, cal_fp16[s])
            runs[str(s)]["reorder"]["w"].setdefault(k, cal_reo[s])
    return {"test_seeds": [5], "cal_seeds": [0, 1], "qs": [1], "precs": ["f16"], "opts": {"sgd": ["sgd", 1.0]},
            "runs": {"sgd": {"c": runs}}, "losses": {"sgd": {"c": {"5": {"honest": 1.0, "f16": 1.01}}}}}


def test_zoned_arbiter_and_budget():
    cal_f = [[1.0] * 10, [2.0] * 10]
    cal_r = [[1e-5] * 5 + [1e-3] * 5, [2e-5] * 5 + [1e-3] * 5]
    # honest test sits inside every threshold; the forgery hides in fp16 (1.5) and has reorder 5e-4:
    # above 10x the first zone's max (2e-4), below the second zone's (1e-2) and below the global (1e-2).
    test = {"honest": ([1.5] * 10, [1e-5] * 10), "f16_1": ([1.5] * 10, [5e-4] * 10)}
    out = A.analyze(_res(cal_f, cal_r, test))["sgd"]["c"]
    c = out["cells"]
    assert c["honest"]["B"] == 0.0 and c["honest"]["flag_two"] == 0.0
    assert c["f16_1"]["B"] == 0.5  # convicted in zone 1 only
    assert c["f16_1"]["A"] == 0.0  # never flagged by the fp16 referee, and below the global arbiter anyway
    b = out["budget"]["tf32"]
    assert b["costA"] == 0.5 and b["f16_1"]["sampled_eqA"] == 0.25
    assert b["f16_1"]["mixed"] == pytest.approx(A.P_MIX * 0.5)


def test_quantile_threshold_is_below_the_max():
    v = np.arange(100, dtype=float)
    assert A.zq(0.05)(v) == 95.0 and A.zq(0.0)(v) == 99.0


def test_frontier_and_saving():
    assert A.saved_prec(10, 0.5) == 0.25
    assert A.frontier([(0.1, 0.2), (0.3, 0.6), (0.2, 0.5)]) == 0.2
    assert A.frontier([(0.1, 0.9)]) == 0.0
