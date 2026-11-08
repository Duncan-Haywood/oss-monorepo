"""The plateau in the pilot-ceiling share is set by the cells (milestone 100)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def test_exact_share_matches_simulation():
    lines = (EXP / "pilot_cert_cells_results.txt").read_text().splitlines()
    head = lines[0]
    assert "cells: 40" in head and "with c = 0: 22" in head
    rows = [l.split(" | ") for l in lines[lines.index("m | exact share with a ceiling | simulated (milestone 99) | difference") + 1:]]
    assert [int(r[0]) for r in rows] == [4, 8, 12, 16, 24, 32, 40]
    assert all(abs(float(r[3])) < 0.01 for r in rows)
    # the exact share can never exceed the share of cells with a certified point
    assert all(float(r[1]) <= 0.4501 for r in rows)


def test_every_three_rung_cell_has_no_certified_point():
    lines = (EXP / "pilot_cert_cells_results.txt").read_text().splitlines()
    r3 = [l for l in lines if " r3 n=" in l]
    assert len(r3) == 20 and all(l.endswith("c=0") for l in r3)
