"""Milestone 139: replay test of milestone 138's post-hoc reading (SWC loses at the tight clock, near theta)."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "tight_theta"


def _load():
    spec = importlib.util.spec_from_file_location("tight_theta_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_fisher_matches_a_hand_case():
    m = _load()
    # [[3, 0], [0, 3]]: P(all 3 successes in row 1) = 1 / C(6, 3)
    assert abs(m.fisher_greater(3, 0, 0, 3) - 1 / 20) < 1e-12
    assert abs(m.fisher_greater(0, 3, 3, 0) - 1.0) < 1e-12


def test_auc_ties_count_half():
    m = _load()
    assert m.auc([1.0], [2.0]) == 1.0 and m.auc([2.0], [1.0]) == 0.0 and m.auc([1.0], [1.0]) == 0.5


def test_guard_only_moves_tight_low_ratio_cells():
    m = _load()
    c = {"clock": "tight", "ratio": 3.5, "SWC": 9.0, "RAND": 2.0}
    assert m.swct(c) == 2.0
    assert m.swct(dict(c, clock="relaxed")) == 9.0
    assert m.swct(dict(c, ratio=4.5)) == 9.0


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    T, S = _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
    assert len(T) == 99 and len(S) == 25
    assert not {(c["table"], c["design"]) for c in S} & {(c["table"], c["design"]) for c in T}
