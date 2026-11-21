"""Milestone 159: splitting milestone 158's build drift at the mapped netlist (replay, no flow run)."""
import importlib.util
from pathlib import Path

TB = Path(__file__).resolve().parents[1] / "experiments" / "tool_build"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t159", TB / "analyse159.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_same_table_has_no_drift():
    m = _load()
    designs, t = m.M158.tables()
    rows = m.M158.per(t["B"], designs[0])
    P = m.pairs(rows, rows)
    assert P and all(m.same_mapped(a, b) and m.lnr(a, b) == 0.0 for _, a, b in P)
    assert all(f(a, b) for _, a, b in P for f in m.STAGES.values())


def test_rerun_reproduces_results(tmp_path):
    m = _load()
    out = m.main(tmp_path / "r.txt")
    assert out["nS"] == 374 and out["nN"] == 2407
    assert len(out["M"]) == 18 and all(out["held"])
    assert (tmp_path / "r.txt").read_text() == (TB / "results159.txt").read_text()


def test_results_record_the_outcome():
    text = (TB / "results159.txt").read_text()
    assert "(1) PRIMARY: mean rho over 18 matched designs 0.539 (median 0.562), interval 0.447 to 0.632: held" in text
    assert "(2) final routed numbers differ on 374 of 374 points in S (100.0%): held" in text
    assert "(3) global_place_wns equal on 8 of 374 points in S: held" in text
    assert text.count(": held") == 7
