import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "halving"
spec = importlib.util.spec_from_file_location("halving_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _row(j, wh, t100=100.0, seg=None):
    wh = list(wh) + [wh[-1]] * (100 - len(wh))
    r = dict(j=j, wh=wh, m=1.0, score=wh[99], t100=t100)
    if seg:
        r["seg"] = seg
    return r


def test_cost_to_uses_segments_when_measured_and_k_over_100_otherwise():
    assert run.cost_to(_row(0, [1.0], t100=50.0), 20) == 10.0
    assert run.cost_to(_row(0, [1.0], seg=[3.0, 1.0, 2.0, 4.0]), 20) == 4.0
    assert run.cost_to(_row(0, [1.0], seg=[3.0, 1.0, 2.0, 4.0]), 100) == 10.0


def test_halving_keeps_the_top_and_charges_each_design_to_its_rung():
    # design 0 leads at cycle 10 but fades; design 2 is third at 10 and wins at 100
    rows = [_row(0, [10] * 10 + [5] * 90), _row(1, [9] * 100), _row(2, [8] * 10 + [12] * 90), _row(3, [1] * 100)]
    gap, picked, t, reached = run.halving(rows, ((10, 3), (20, 2)))
    assert reached == {0: 20, 1: 100, 2: 100, 3: 10}
    assert sorted(picked) == [1, 2] and gap == 0.0
    assert t == 20 + 100 + 100 + 10
    g1, p1, _ = run.fixed(rows, 10, 1)
    assert p1 == [0] and abs(g1 - (1 - 5 / 12)) < 1e-12


def test_fixed_without_resume_charges_separate_short_and_long_runs():
    rows = [_row(0, [3.0], t100=100.0), _row(1, [2.0], t100=100.0)]
    _, _, t = run.fixed(rows, 10, 1, resume=False)
    assert t == 2 * 10.0 + 100.0


def test_stable_set_compares_top_sets():
    rows = [_row(i, [i] * 5 + [10 - i] * 95) for i in range(6)]
    assert not run.stable_set(rows, 10, 5, 3)
    assert run.stable_set(rows, 20, 10, 3)


def test_verdicts_follow_the_registered_thresholds():
    c = dict(gap=0.0, t_ratio=0.2, fixed10=dict(gap=0.05), rho={10: 0.5})
    v = run.verdicts({"Ai2020@a": c, "X@b": dict(c, gap=0.04, t_ratio=0.3, fixed10=dict(gap=0.0), rho={10: 0.99})}, ["Ai2020@a"])
    assert v == dict(H82="refuted", H83="mixed", H84="refuted", H85="supported")


def test_committed_dev_replay_is_consistent():
    d = json.loads((HERE / "dev.json").read_text())
    assert len(d["conditions"]) == 27
    assert d["pooled"]["gap"]["exact"] == 26
    for c in d["conditions"].values():
        assert 0 <= c["gap"] and c["t_ratio"] < 0.25
