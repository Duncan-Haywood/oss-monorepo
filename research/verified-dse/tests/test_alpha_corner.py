"""Milestone 151: the clip's alpha per corner, chosen leave-one-milestone-out at ff and replayed at tt."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def _load():
    spec = importlib.util.spec_from_file_location("verified_dse_t151", EXP / "alpha_corner" / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _unit(fold, design, clip, ratio=5.0, rand=9.0):
    return {"corner": "ff", "fold": fold, "design": design, "cell": {"ratio": ratio, "rand": rand, "clip": clip}, "rows": None}


def test_swc_uses_random_below_theta():
    m = _load()
    c = {"ratio": 2.0, "rand": 7.0, "clip": {a: 0.0 for a in m.GRID}}
    assert m.swc(c, 0) == 7.0
    c["ratio"] = 4.0
    assert m.swc(c, 0) == 0.0


def test_choose_breaks_ties_toward_the_incumbent():
    m = _load()
    us = [_unit("m1", "a", {a: 1.0 for a in m.GRID})]
    assert m.choose(us) == 1.25
    us = [_unit("m1", "a", {0: 0.5, 0.5: 0.5, 0.8: 2.0, 1: 2.0, 1.25: 2.0})]
    assert m.choose(us) == 0.5


def test_lofo_never_reads_the_held_out_fold():
    """Fold m2 prefers alpha 0 strongly; m1 prefers 1.25. Holding out m1 must pick 0, holding out m2 must pick 1.25."""
    m = _load()
    us = [_unit("m1", "a", {0: 9.0, 0.5: 9.0, 0.8: 9.0, 1: 9.0, 1.25: 0.0}),
          _unit("m2", "b", {0: 0.0, 0.5: 9.0, 0.8: 9.0, 1: 9.0, 1.25: 9.0})]
    pick, reg = m.lofo(us, lambda f: us)
    assert pick == {"m1": 0, "m2": 1.25}
    assert sorted(reg.values()) == [9.0, 9.0]


def test_binds_counts_points_where_the_period_wins():
    m = _load()
    rs = [{"period_ns": 10.0, "synth_netlist_wns": 2.0}, {"period_ns": 10.0, "synth_netlist_wns": -4.0}]  # mapped delay 8, 14
    assert m.binds(rs, 0) == 1.0
    assert m.binds(rs, 1.25) == 0.5
    assert m.binds(rs, 1) == 0.5
    assert m.binds(rs, None) == 0.0


def test_results_reproduce_the_published_swc_numbers():
    text = (EXP / "alpha_corner" / "results.txt").read_text()
    assert "reproduction: ff SWC(1.25) 2.98%; tt B42 SWC(1.25) 3.30%" in text
    assert "pooled: LOMO 3.62% against SWC(1.25) 2.98%" in text
    assert "(1) PRIMARY: ff LOMO below SWC(1.25): refuted" in text
