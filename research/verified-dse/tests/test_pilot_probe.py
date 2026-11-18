"""Milestone 129: the pilot-probe guard SWP(s) priced by replay on milestones 119 to 125."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "pilot_probe"


def _load():
    spec = importlib.util.spec_from_file_location("pilot_probe_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registered_parameters():
    a = _load()
    assert (a.S, a.DRAWS, a.SEED) == (32, 200, 129)
    assert a.SS == (16, 24, 32, 48)


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "90 cells on 45 designs; 67 on the ladder branch" in t
    assert "(1) SWP(32) below SWC: True (4.39% against 4.77%)" in t
    assert "(4) where SWC <= 0.5%, SWP(32) less than 1 point above SWC: False (1.15% against 0.00%)" in t
    assert "(5) where SWC loses by > 1 point, SWP(32) below SWC and above SWS(24,3): True (11.83% against 16.63% and 9.16%)" in t
