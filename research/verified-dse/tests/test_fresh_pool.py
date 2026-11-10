"""Fresh 120-sequence pool (milestone 108)."""
import importlib.util
import random
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "fresh_pool"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"fresh_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_sequences_disjoint_from_milestone1():
    run = _load("run")
    s = run.fresh_sequences(120)
    assert len(set(s)) == 120 and not set(s) & set(run.sequences(60)) and () not in s


def test_regret_zero_when_rungs_are_faithful():
    an = _load("analyse")
    sc = [{"r1": v, "r2": v, "r3": v, "r4": v} for v in range(1, 31)]
    assert an.regret(sc, (30, 8, 8), random.Random(0), 5) == 0.0


def test_regret_when_rungs_are_reversed():
    an = _load("analyse")
    sc = [{"r1": -v, "r2": -v, "r3": -v, "r4": v} for v in range(1, 31)]
    # keeps the 8 worst routed points (23..30): best survivor 23, pool minimum 1
    assert abs(an.regret(sc, (30, 8, 8), random.Random(0), 5) - 2200.0) < 1e-9


def test_fresh_pool_summary():
    t = (EXP / "results.txt").read_text()
    assert "mean over 20 cells: skip-r1 1.04%, 105-style 5.49%, random 8 8.00%, skip-r1 at N=50 0.43%" in t
    assert "tight | adder_ripple16 | 104 | 0.00 | 34.27 | 27.89 | 0.00" in t
    for k in range(1, 6):
        assert f"({k})" in t and t.split(f"({k})")[1].splitlines()[0].endswith("True")


def test_price_cost_model():
    pr = _load("price")
    t = {"r1": 0.1, "r2": 0.8, "r3": 0.1, "r4": 0.3}
    skip, m105, pp = pr.costs(t, 100)
    assert abs(skip - (80 + 0.8 + 2.4)) < 1e-9
    assert abs(m105 - (10 + 56 + 1.6 + 2.4)) < 1e-9
    assert abs(pp - 1.2) < 1e-9
    assert pr.equal_k(skip, pp, 100) == 69 and pr.equal_k(1e9, pp, 100) == 100 and pr.equal_k(0.0, pp, 100) == 1
    assert pr.sign_p(14, 6) == pr.sign_p(6, 14) and abs(pr.sign_p(14, 6) - 0.1153) < 1e-3


def test_price_summary():
    t = (EXP / "price_results.txt").read_text()
    assert "mean regret over 20 cells: skip-r1 1.04%, random at its cost 1.26%; 105-style 5.48%, random at its cost 1.43%" in t
    assert t.split("(3)")[1].splitlines()[0].endswith("False")
    for k in (1, 2, 4):
        assert t.split(f"({k})")[1].splitlines()[0].endswith("True")
