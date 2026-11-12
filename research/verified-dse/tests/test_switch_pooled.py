"""Milestone 117: the switch's out-of-sample evidence pooled by test status."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "switch_pooled"


def _pool():
    spec = importlib.util.spec_from_file_location("switch_pooled_pool", EXP / "pool.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_sign_p_exact():
    p = _pool()
    assert p.sign_p(0, 0) == 1.0
    assert abs(p.sign_p(9, 1) - 22 / 1024) < 1e-12  # 2 * (1 + 10) / 2^10
    assert p.sign_p(5, 5) == 1.0
    assert p.sign_p(3, 4) == p.sign_p(4, 3)


def test_compare_counts_ties():
    p = _pool()
    rows = [{"a": 1.0, "b": 2.0}, {"a": 2.0, "b": 2.0}, {"a": 3.0, "b": 2.0}, {"a": 0.0, "b": 5.0}]
    assert p.compare(rows, lambda c: c["a"], lambda c: c["b"]) == (2, 1, 1)


def test_boot_ci_resamples_designs_and_brackets_a_constant():
    p = _pool()
    rows = [{"table": "t", "design": d, "x": 1.5} for d in "abc"]
    assert p.boot_ci(rows, lambda c: c["x"], boot=200) == (1.5, 1.5)


def test_results_match_published_milestone_numbers():
    txt = (EXP / "results.txt").read_text()
    # SWC's 24 blind cells are milestone 115's 14 (0.83%) and 116's 10 (2.69%): (14 * 0.83 + 10 * 2.69) / 24 = 1.60
    assert "SWC's test set (milestones 115, 116; alpha fixed in 115 before either blind run): 24 cells on 12 designs" in txt
    assert "SWC 1.60" in txt
    # the pooled 124 cells match milestone 116's pooled line (SW 1.87%, SWC 1.02%, random 2.36%)
    assert "mean regret %: SW 1.87, SWC 1.02, random 2.36" in txt
