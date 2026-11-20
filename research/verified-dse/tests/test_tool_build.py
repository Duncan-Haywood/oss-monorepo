"""Milestone 158: milestone 143's 27 ss designs under two tool builds (replay, no flow run)."""
import importlib.util
from pathlib import Path

TB = Path(__file__).resolve().parents[1] / "experiments" / "tool_build"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t158", TB / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_tables_pair_on_all_27_designs():
    m = _load()
    designs, t = m.tables()
    assert len(designs) == 27
    for k in ("A", "B", "R"):
        assert {r["design"] for r in t[k]} == set(designs)
        assert len(t[k]) == 27 * 120


def test_transfer_is_zero_for_the_same_table():
    m = _load()
    designs, t = m.tables()
    rows = m.per(t["B"], designs[0])
    assert m.transfer(rows, rows) == 0.0


def test_results_record_the_outcome():
    text = (TB / "results.txt").read_text()
    assert "(1) PRIMARY: mean d(B) - d(A) -0.48 points, interval -3.05 to +1.78; higher under B on 13 of 27, lower on 14: held" in text
    assert "(3) median tauR(A, B) 0.618 (range 0.247 to 0.801); same routed-best on 4 of 27: held" in text
    assert "(6) mean |d(B) - d(A)| 4.39 against mean |d(R) - d(B)| 1.55; difference +2.84, interval +1.36 to +4.74: held" in text
    assert "transfer: A's routed-best under B, mean regret 13.99%" in text
    assert text.count(": held") == 7
