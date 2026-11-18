"""Milestone 130: the hedged fall-back SWH(32, h) priced by replay on milestones 119 to 125."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "hedge_probe"


def _load():
    spec = importlib.util.spec_from_file_location("hedge_probe_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registered_parameters():
    a = _load()
    assert (a.S, a.H, a.DRAWS, a.SEED) == (32, 3, 200, 130)
    assert a.HS == (1, 2, 3, 5, 7) and a.HMS == (3, 5)


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_pairs_with_milestone_129():
    """The paired draws reproduce milestone 129's SWP(32) means."""
    t = (EXP / "results.txt").read_text()
    assert "SWP(32) 4.39" in t and "SWP(32) 11.83" in t and "SWP(32) 1.15" in t


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "(1) SWH(32,3) below SWP(32): True (4.37% against 4.39%)" in t
    assert "(5) SWH(32,3) better than SWP(32) on more cells than worse: True (better 24, worse 1, tied 65)" in t
    assert "(6) SWHM(32,3) above SWP(32): True (4.69% against 4.39%)" in t
