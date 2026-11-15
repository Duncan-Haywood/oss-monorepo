"""Milestone 127: the top-probe guard SWT(m) priced by replay on milestones 119 to 125."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "top_probe"


def _load():
    spec = importlib.util.spec_from_file_location("top_probe_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registered_parameters():
    a = _load()
    assert (a.M, a.DRAWS, a.SEED, a.MS) == (3, 200, 127, (1, 2, 3))



def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "90 cells on 45 designs; 67 on the ladder branch" in t
    assert "(1) SWT(3) below SWC: False (5.11% against 4.77%)" in t
    assert "(3) distrust share above 0.5 where SWC loses by > 1 point (17 cells, 0.54) and below 0.25 where SWC <= 0.5% (40 cells, 0.07): True" in t
    assert "(4) bound SWT*(3) below SWC and random: True (4.19% against 4.77% and 5.44%)" in t
    assert "(6) design-bootstrap 95% interval of mean (SWT(3) - SWC) below 0: False" in t
