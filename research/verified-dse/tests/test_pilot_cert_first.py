"""The first keep, not the later ones, blocks certification of most three-rung cells (milestone 103)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def test_first_keep_grid():
    L = (EXP / "pilot_cert_first_results.txt").read_text().splitlines()
    assert "monotone in F in every cell: True" in L
    rows = {l.split(" | ")[0].strip(): l.split(" | ")[1].split() for l in L if l.startswith("F=")}
    assert rows["F=16"] == ["6", "8"]
    assert rows["F=35"] == ["15", "18"]
    assert rows["F=50"] == ["16", "18"]
