"""Milestone 131: the confirmation probe SWQ(32, k) and margin SWM(32, f) priced by replay on milestones 119 to 125."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "confirm_probe"


def _load():
    spec = importlib.util.spec_from_file_location("confirm_probe_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registered_parameters():
    a = _load()
    assert (a.S, a.DRAWS, a.SEED) == (32, 200, 131)
    assert a.KS == (1, 2) and a.FS == (0.005, 0.01, 0.02, 0.05)


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_pairs_with_milestone_129():
    """The paired draws reproduce milestone 129's SWP(32) means and distrust shares."""
    t = (EXP / "results.txt").read_text()
    assert "SWP(32) 4.39" in t and "SWP(32) 11.83" in t and "SWP(32) 1.15" in t
    assert "distrust share, SWP(32): 0.34 where SWC loses, 0.12 where SWC <= 0.5%" in t


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "(1) SWQ(32,1) below SWP(32): False (4.53% against 4.39%)" in t
    assert "(3) SWQ(32,1) distrust below 0.06 where SWC <= 0.5% and above 0.2 where SWC loses: False (0.037 and 0.141)" in t
    assert "(6) SWQ(32,1) better than SWP(32) on more cells than worse: True (better 46, worse 20, tied 24)" in t
