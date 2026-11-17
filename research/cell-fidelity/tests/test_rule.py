import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "rule"
spec = importlib.util.spec_from_file_location("rule_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _ok(wh, r=0.5, mass=1.0, n=100):
    return {"ok": True, "ok_cycles": n, "cycle_wh": [wh] * n, "mass_kg": mass, "r_min": r}


def test_choose_cells_takes_first_two_that_run():
    p = {"A": {"SPMe": {"ok": False}, "DFN": {"ok": True}}, "B": {"SPMe": {"ok": True}, "DFN": {"ok": True}},
         "C": {"SPMe": {"ok": True}, "DFN": {"ok": True}}, "D": {"SPMe": {"ok": True}, "DFN": {"ok": True}}}
    assert run.choose_cells(p, ("A", "B", "C", "D"), 2) == ["B", "C"]
    assert run.choose_cells({}, ("A",), 2) == []


def test_screen_rescues_stop_only_when_v1_finishes():
    stop = {"ok": True, "ok_cycles": 40, "cycle_wh": [1.0] * 40, "mass_kg": 1.0, "r_min": 0.7}
    assert run.screen(_ok(2.0, 0.4), None) == ("ok", 2.0, 0.4, False)
    assert run.screen(stop, _ok(3.0, 0.6)) == ("rescued", 3.0, 0.6, True)
    assert run.screen(stop, dict(stop)) == ("fail", 0.0, None, False)
    assert run.screen(stop, None) == ("fail", 0.0, None, False)
    assert run.screen({"ok": False, "ok_cycles": 0}, None)[0] == "fail"


def test_queue_puts_failures_first_then_ascending_r():
    rows = [dict(kind="ok", r=0.5), dict(kind="fail", r=None), dict(kind="ok", r=0.1), dict(kind="rescued", r=0.1)]
    assert run.queue(rows) == [1, 2, 3, 0]


def test_mis_scored_is_milestone_one_label():
    assert run.mis_scored(0.0, 100.0)
    assert run.mis_scored(74.0, 100.0)
    assert not run.mis_scored(75.0, 100.0)
    assert not run.mis_scored(130.0, 100.0)


def test_apply_rule_stops_after_three_sound_and_confirms_pick():
    # design 0 fails (bad), 1 depleted (bad), 2-4 sound, 5 sound with the best screen score (never verified)
    rows = [dict(kind="fail", score=0.0, r=None, dfn=150.0),
            dict(kind="ok", score=20.0, r=0.01, dfn=140.0),
            dict(kind="ok", score=100.0, r=0.2, dfn=101.0),
            dict(kind="ok", score=100.0, r=0.3, dfn=99.0),
            dict(kind="ok", score=100.0, r=0.4, dfn=100.0),
            dict(kind="ok", score=120.0, r=0.9, dfn=121.0)]
    res = run.apply_rule(rows)
    assert res["verified_idx"] == [0, 1, 2, 3, 4]
    assert res["recall"] == 1.0 and res["n_bad"] == 2
    assert res["pick"] == 0 and res["calls"] == 5          # design 0's verified DFN 150 beats 121
    assert res["pick_gap"] == 0.0
    rows[0]["dfn"] = 110.0
    res = run.apply_rule(rows)
    assert res["pick"] == 1 and res["calls"] == 5


def test_apply_rule_counts_confirmation_call_and_misses():
    rows = [dict(kind="ok", score=10.0, r=0.9, dfn=100.0)] + [dict(kind="ok", score=50.0, r=0.1 * k, dfn=50.0) for k in range(1, 4)]
    res = run.apply_rule(rows)
    assert res["missed"] == [0] and res["recall"] == 0.0
    assert res["pick"] == 1 and res["calls"] == 3
    assert abs(res["pick_gap"] - 0.5) < 1e-12


def test_verdict():
    assert run.verdict([1.0, 0.95], lambda x: x >= 0.9, lambda x: x < 0.8) == "supported"
    assert run.verdict([1.0, 0.85], lambda x: x >= 0.9, lambda x: x < 0.8) == "mixed"
    assert run.verdict([1.0, 0.7], lambda x: x >= 0.9, lambda x: x < 0.8) == "refuted"
    assert run.verdict([None], lambda x: True, lambda x: False) == "untestable"


def test_pick_variants_fix_the_mixed_fidelity_pick():
    # SPMe over-scores every design by ~3%; the verified best (design 0) loses to an unverified SPMe score
    rows = [dict(kind="ok", score=206.0, r=0.30, dfn=200.0), dict(kind="ok", score=150.0, r=0.31, dfn=148.0),
            dict(kind="ok", score=150.0, r=0.32, dfn=147.0), dict(kind="ok", score=202.0, r=0.9, dfn=196.0),
            dict(kind="ok", score=201.0, r=0.8, dfn=195.0)]
    for j, r in enumerate(rows):
        r["j"] = j
    res = run.apply_rule(rows)
    assert res["verified_idx"] == [0, 1, 2] and res["pick"] == 3 and res["calls"] == 4
    assert abs(res["pick_gap"] - 0.02) < 1e-12
    v = run.pick_variants(rows, res)
    assert v["best_verified_gap"] == 0.0 and v["best_verified_calls"] == 4
    assert v["iterate_gap"] == 0.0 and v["iterate_calls"] == 5 and v["iterate_pick"] == 0
