"""Milestone 114: a guard read from the mapped rung alone (no routed pilot) for the relaxed-clock multiplier miss."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "r2_guard"


def _load():
    spec = importlib.util.spec_from_file_location("r2_guard_guard", EXP / "guard.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_family_strips_sizes():
    g = _load()
    assert {g.family(d) for d in ("mult16", "mult40", "mult18")} == {"mult"}
    assert g.family("xbar32x4") == g.family("xbar16") == "xbar"
    assert g.family("gf2mat48") == "gf2mat" and g.family("sort8x8") == "sort"


def test_guard_only_acts_above_the_cost_threshold():
    g = _load()
    cell = {"ratio": 2.0, "skip": 9.0, "rand": 1.0, "slack": 0.5, "dcv": 0.9}
    every = ("AB", 0.15, 0.2)
    assert g.swx(cell, every) == g.sw(cell) == 1.0  # below 3 SW already routes randomly
    cell["ratio"] = 5.0
    assert g.sw(cell) == 9.0 and g.swx(cell, every) == 1.0
    assert g.swx(cell, ("A", 0.6, None)) == 9.0  # not flagged: stays on the ladder


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_summary():
    t = (EXP / "results.txt").read_text()
    assert "Chosen guard: AB(0.15, 0.3)" in t
    assert "SW 1.66%, SWX in-sample 1.15%, SWX leave-one-family-out 1.25%" in t
    assert "mean regret: SW 0.97%, SWX 1.16%" in t
    assert "best guard in hindsight on the dear-pool cells: A(0.3) at 0.89% against SW 0.97%" in t
    for k, want in zip(range(1, 7), (True, False, False, True, True, False)):
        assert t.split(f"({k})")[1].splitlines()[0].split(":")[1].strip().startswith(str(want))
