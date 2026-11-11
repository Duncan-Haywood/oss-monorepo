"""Cost-ratio switch and routed-pilot guard (milestone 111)."""
import importlib.util
import random
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "switch_guard"


def _load():
    spec = importlib.util.spec_from_file_location("switch_guard_rule", EXP / "rule.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_guard_is_budget_matched_and_falls_back_to_random():
    m = _load()
    # perfectly faithful r2: the guard never falls back at tau0 = 0.4 and finds the optimum
    sc = [{"r2": float(i), "r4": 10.0 + i} for i in range(30)]
    reg, fell = m.guard_regret(sc, 12, 4, 0.4, random.Random(1))
    assert fell == 0 and reg == 0
    # perfectly anti-faithful r2: always falls back, and then routes k points like random routing
    anti = [{"r2": float(-i), "r4": 10.0 + i} for i in range(30)]
    _, fell = m.guard_regret(anti, 12, 4, 0.4, random.Random(1))
    assert fell == 1
    # tau0 = -1 never falls back
    _, fell = m.guard_regret(anti, 12, 4, -1, random.Random(1))
    assert fell == 0


def test_switch_picks_by_ratio():
    m = _load()
    c = {"ratio": 3.5, "skip": 1.0, "rand": 2.0, "g": {(6, -1): 0.5}}
    assert m.sw(c, 3) == 1.0 and m.sw(c, 4) == 2.0
    assert m.swg(c, 3, (6, -1)) == 0.5 and m.swg(c, 4, (6, -1)) == 2.0


def test_summary():
    t = (EXP / "results.txt").read_text()
    assert "SW: 3 -> in-sample 1.66%, leave-one-design-out 1.66%" in t
    assert "G: (6, -1) -> in-sample 2.32%, leave-one-design-out 3.11%" in t
    assert "fresh pool mean regret SW: 1.21%" in t
    for k, want in zip(range(1, 7), (True, True, True, False, True, True)):
        assert t.split(f"({k})")[1].splitlines()[0].endswith(str(want))


def test_rule_reproduces_results(tmp_path):
    m = _load()
    out = tmp_path / "r.txt"
    m.main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
