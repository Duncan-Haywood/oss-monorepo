"""Routed regret of the two certifiable schedules (milestone 105)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def test_regret_summary():
    t = (EXP / "pilot_cert_sched_regret_results.txt").read_text()
    assert "cells where 3-rung mean regret <= 2-rung: 18 of 20" in t
    assert "mean regret over cells %: 2-rung 2.27, 3-rung 1.18, random 5 7.86, random 8 5.38" in t
    assert "worst cell mean regret %: 2-rung 13.92, 3-rung 11.83" in t
