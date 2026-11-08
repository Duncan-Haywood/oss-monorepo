"""Committed pilot-size sweep is consistent (milestone 99)."""
from pathlib import Path

RES = Path(__file__).resolve().parents[1] / "experiments" / "theory" / "pilot_cert_size_results.txt"


def test_sweep_shape():
    rows = [l.split(" | ") for l in RES.read_text().splitlines()[1:]]
    assert [int(r[0]) for r in rows] == [4, 8, 12, 16, 24, 32, 40]
    assert all(int(r[4]) == 0 for r in rows)
    share = [float(r[3]) for r in rows]
    assert share == sorted(share) and share[-1] < 0.6
    assert all(float(r[3]) >= float(r[2]) for r in rows)
