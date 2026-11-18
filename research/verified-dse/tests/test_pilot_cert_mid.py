"""Widening the middle keep adds at most one more certified cell over the final keep alone (milestone 102)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def _lines():
    return (EXP / "pilot_cert_mid_results.txt").read_text().splitlines()


def test_monotone_and_grid():
    L = _lines()
    assert "monotone in M and K in every cell: True" in L
    rows = {l.split(" | ")[0].strip(): l.split(" | ")[1].split() for l in L if l.startswith("M=")}
    assert rows["M= 2".strip()] == ["0", "4", "4", "4"]
    assert rows["M=16"] == ["0", "6", "6", "8"]
