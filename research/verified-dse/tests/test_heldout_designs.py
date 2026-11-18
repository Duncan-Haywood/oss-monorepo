"""Keep schedules on 26 held-out designs (milestone 110)."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "heldout_designs"


def _load():
    spec = importlib.util.spec_from_file_location("heldout_replay", EXP / "replay.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_no_table_overlaps_the_schedule_choice_designs():
    m = _load()
    raw = m.load()
    designs = {d for _, d, _ in raw}
    assert len(designs) == 26 and not designs & set(m.flow.DESIGNS)
    assert all(len(v) >= 50 for v in raw.values()) and len(raw) == 52


def test_heldout_summary():
    t = (EXP / "results.txt").read_text()
    assert "mean regret: skip-r1 4.38%, 105-style 4.89%, random 8 5.95%" in t
    assert "equal cost: skip-r1 4.38% vs random 2.31%: better in 37, worse in 13, tied in 2 (sign test p = 0.001)" in t
    assert "cells with routed/r2 > 3: skip-r1 better than equal-cost random in 18, worse in 5, tied in 0" in t
    assert "hostile | tight | bcastmix192 | 60 | 2.06 | 0.55 | 49.85 |" in t
    for k in range(1, 6):
        assert f"({k})" in t and t.split(f"({k})")[1].splitlines()[0].endswith("True")


def test_replay_reproduces_results(tmp_path):
    m = _load()
    out = tmp_path / "r.txt"
    m.main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
