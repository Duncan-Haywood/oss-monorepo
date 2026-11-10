"""Leave-one-design-out keep schedule (milestone 106)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def test_lodo_summary():
    t = (EXP / "pilot_cert_sched_lodo_results.txt").read_text()
    assert "mean held-out regret %: chosen 0.95, 105 schedule 1.17, oracle 0.77" in t
    assert "distinct chosen schedules over 10 folds: 1: [(50, 8, 8)]" in t
