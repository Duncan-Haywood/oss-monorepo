"""Milestone 134: diagnosis of the clipped ladder's blind failures (replay of milestones 125, 132 and 133)."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "ladder_diagnosis"


def _load():
    spec = importlib.util.spec_from_file_location("ladder_diagnosis_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_tau_b_matches_hand_cases():
    a = _load()
    assert a.tau_b([1, 2, 3, 4], [1, 2, 3, 4]) == 1.0
    assert a.tau_b([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0
    # one tie in x: c = 5, d = 0, tx = 1, ty = 0 -> 5 / sqrt(6 * 5)
    assert abs(a.tau_b([1, 1, 2, 3], [1, 2, 3, 4]) - 5 / (6 * 5) ** 0.5) < 1e-12


def test_log_split_is_exact():
    a = _load()
    r = {"period_ns": 10.0, "synth_netlist_area": 100.0, "synth_netlist_wns": 2.0, "final_area_notap": 120.0, "final_wns": 4.0}
    q = a.parts(r)
    assert q["D2"] == 8.0 and q["D4"] == 6.0 and q["A4"] * q["D4"] == 720.0


def test_results_record_the_registered_outcome():
    txt = (EXP / "results.txt").read_text()
    for line in ("(1) 8 failing cells and >= 20 winning: True", "(2) failing cells, delay share of log regret > 0.5: True",
                 "(3) tau(A2, A4) > 0.5 in both groups: True", "(4) clip share higher on failing cells: False",
                 "(5) tau(D2, D4) lower on failing cells: True", "(6) tau(A2, D4) lower on failing cells: True"):
        assert line in txt
    assert "## Per cell (36 ladder-branch cells)" in txt


def test_swc_reproduces_from_this_files_draws():
    txt = (EXP / "results.txt").read_text()
    assert "SWC % | 14.25 | 0.02" in txt and "SWC check (this file's tie-breaks) % | 14.25 | 0.02" in txt
