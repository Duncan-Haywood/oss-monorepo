"""Milestone 126: the probe-rank guard SWCV(p, tau0) priced by replay on milestones 119 to 125."""
import importlib.util
import re
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "pilot_rank"


def _load():
    spec = importlib.util.spec_from_file_location("pilot_rank_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registered_parameters():
    a = _load()
    assert (a.P, a.TAU0, a.DRAWS, a.SEED) == (4, 0, 200, 126)
    assert (4, 0) in a.GRID and (4, -1) in a.GRID and len(a.GRID) == 12


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "90 cells on 45 designs; 67 on the ladder branch" in t
    held = {int(n): v == "True" for n, v in re.findall(r"^\((\d)\) .*?: (True|False)", t, re.M)}
    assert held == {1: False, 2: True, 3: True, 4: False, 5: True, 6: False}
