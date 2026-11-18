"""A larger final keep makes few three-rung cells certifiable (milestone 101)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def _lines():
    return (EXP / "pilot_cert_keep_results.txt").read_text().splitlines()


def test_monotone_and_counts():
    L = _lines()
    assert "monotone in K in every cell: True" in L
    row = [l for l in L if l.startswith("cells with c >= 1")][0].split(" | ")[1:]
    assert row == ["0", "2", "6", "6", "7"]


def test_cells_listed():
    assert len([l for l in _lines() if " n=" in l and ": " in l]) == 20
