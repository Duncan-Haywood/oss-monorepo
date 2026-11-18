"""The F = 35 three-rung schedule is cheaper than the two-rung ladder at equal certification (milestone 104)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def test_cost_summary():
    t = (EXP / "pilot_cert_cost_results.txt").read_text()
    assert "cells where 3-rung costs more than 2-rung: 0 of 20" in t
    assert "certified cells 2-rung 18, 3-rung 18, same set: True" in t
    assert "median cost ratio 3-rung / 2-rung: 0.91" in t
