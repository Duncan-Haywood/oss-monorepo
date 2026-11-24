"""Milestone 165: the tie rule on the shifter guard's blind evidence (replay of committed tables; no EDA tools needed)."""
import importlib.util
from pathlib import Path

TR = Path(__file__).resolve().parents[1] / "experiments" / "tie_rule"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t165", TR / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_classes():
    m = _load()
    assert m.cls(-4.0, 4) == "win" and m.cls(4.0, 4) == "loss" and m.cls(3.99, 4) == "tie" and m.cls(0.0, 4) == "tie"


def test_misplaced_and_cuts():
    m = _load()
    rows = [{"d": 10, "depth": 5}, {"d": -10, "depth": 50}, {"d": 1, "depth": 40}]
    assert m.misplaced(rows, 32, 4) == 0
    assert m.misplaced(rows, 60, 4) == 1
    best, cuts = m.best_cuts(rows, 4)
    assert best == 0 and 6 in cuts and 50 in cuts and 5 not in cuts and 51 not in cuts
    assert m.runs([1, 2, 3, 7, 9, 10]) == "1-3, 7, 9-10"


def test_sign_p():
    m = _load()
    assert abs(m.sign_p(11, 1) - 0.00635) < 1e-4
    assert m.sign_p(0, 0) == 1.0


def test_collect_reproduces_committed_counts():
    m = _load()
    d = m.collect()
    assert len(d) == 64
    dep = [dict(v, design=k) for k, v in d.items() if v["depth"] is not None]
    assert len(dep) == 56
    assert sum(m.cls(r["d"], 4) == "tie" for r in dep) == 31
    assert m.misplaced(dep, 32, 4) == 6
    hi = [m.cls(r["d"], 4) for r in dep if r["depth"] >= 32]
    lo = [m.cls(r["d"], 4) for r in dep if r["depth"] < 32]
    assert (hi.count("win"), hi.count("loss")) == (11, 1)
    assert (lo.count("win"), lo.count("loss")) == (5, 8)
    assert abs(d["funnel128"]["d"] - 36.06) < 0.01 and d["pmul4"]["depth"] == 36
