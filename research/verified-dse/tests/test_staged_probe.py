"""Milestone 128: the staged top-probe guard SWS(s, m) priced by replay on milestones 119 to 125."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "staged_probe"


def _load():
    spec = importlib.util.spec_from_file_location("staged_probe_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registered_parameters():
    a = _load()
    assert (a.S, a.M, a.DRAWS, a.SEED) == (24, 3, 200, 128)
    assert a.GRID == tuple((s, m) for s in (16, 24, 32) for m in (1, 2, 3))


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "90 cells on 45 designs; 67 on the ladder branch" in t
    assert "(1) SWS(24,3) below SWC: False (5.31% against 4.77%)" in t
    assert "(4) where SWC loses by > 1 point, SWS(24,3) below SWT(3): True (9.16% against 13.32%)" in t
    assert "(5) where SWC <= 0.5%, SWS(24,3) more than 1 point above SWC: True (4.23% against 0.00%)" in t
