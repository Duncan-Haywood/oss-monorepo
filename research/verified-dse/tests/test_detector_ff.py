"""Milestone 150: pre-routing detectors for the clipped ladder's ff losses, replayed on milestones 144 to 147."""
import importlib.util
import random
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def _load():
    spec = importlib.util.spec_from_file_location("verified_dse_t150", EXP / "detector_ff" / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_topk_finds_the_best_when_the_key_is_the_target():
    m = _load()
    y = [5.0, 3.0, 9.0, 1.0, 7.0, 2.0, 8.0, 4.0, 6.0, 10.0]
    assert m.topk(y, y, "t") == 0.0


def test_best_rule_recovers_a_planted_detector():
    """Designs with feature below 0.5 gain 10 points from the response, the rest lose 10: the search must flag exactly those."""
    m = _load()
    keys = [(144, f"d{i}") for i in range(10)]
    F = {k: {f: (i / 10 if f == "spread" else random.Random(i).random()) for f in m.FEATURES} for i, k in enumerate(keys)}
    R = {k: {"SWC": 10.0, "A_r2": (0.0 if i < 5 else 20.0), "A_area": 30.0, "A_r8": 30.0, "free_rand": 30.0}
         for i, k in enumerate(keys)}
    rule, v = m.best_rule(keys, F, R, m.REAL, set(keys))
    assert rule[0] == "spread" and rule[1] == "<" and rule[3] == "A_r2" and 0.4 < rule[2] < 0.5
    assert abs(v - 5.0) < 1e-9
    assert [m.apply(rule, F, R, k) for k in keys] == [0.0] * 5 + [10.0] * 5


def test_best_rule_returns_none_when_nothing_helps():
    m = _load()
    keys = [(145, f"d{i}") for i in range(6)]
    F = {k: {f: float(i) for f in m.FEATURES} for i, k in enumerate(keys)}
    R = {k: {"SWC": 1.0, **{a: 2.0 for a in m.RESP}} for k in keys}
    assert m.best_rule(keys, F, R, m.RESP, set(keys)) == (None, 1.0)


def test_replay_reproduces_milestone_148_and_the_headline(tmp_path):
    m = _load()
    s = m.main(tmp_path / "r.txt")
    assert (s["losers"], s["others"]) == (14, 59)
    assert round(s["swc"], 2) == 2.98
    assert round(s["lomo"], 2) == 3.61
    assert round(s["area_only"], 2) == 2.69
    assert round(s["be"]["free_rand"], 3) == 0.171
