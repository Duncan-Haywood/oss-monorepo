import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "switch"
spec = importlib.util.spec_from_file_location("switch_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _row(score, dfn, r=0.5, kind="ok", ts=1.0, td=4.0):
    return dict(score=score, dfn=dfn, r=r, kind=kind, t_spme=ts, t_dfn=td)


def test_suspect_flags_failures_and_low_salt():
    assert run.suspect(_row(0, 10, None, "fail"))
    assert run.suspect(_row(9, 10, 0.05))
    assert not run.suspect(_row(9, 10, 0.10))


def test_spme_pilot_share_and_dfn_positions():
    pilot = [_row(9, 10, 0.5), _row(0, 10, None, "fail", ts=0.1), _row(9, 10, 0.05), _row(9, 10, 0.8)]
    share, s, q = run.spme_pilot(pilot, n=64, n_dfn=2, r_star=0.1, run_of=3)
    assert q == [1, 2]                      # failure first, then lowest r
    assert s == 0.5
    assert abs(share - (1.0 / 4.0 + 0.5 + 3 / 64)) < 1e-12   # median ok SPMe time 1.0 over mean DFN 4.0


def test_iterate_pick_verifies_until_leader_is_verified():
    rows = [_row(10, 8), _row(9, 9.5), _row(5, 5)]
    pick, ver = run.iterate_pick(rows, [])
    assert pick == 1 and ver == {0, 1}


def test_rule_from_counts_pre_verified_toward_the_run():
    # queue order by r: 0 (bad), 1 (bad, pre-verified), 2, 3, 4 sound, 5 bad
    rows = [_row(1, 10, 0.01), _row(1, 10, 0.02), _row(9, 9, 0.3), _row(9, 9, 0.4), _row(9, 9, 0.5), _row(1, 10, 0.6)]
    _, ver = run.rule_from(rows, [1], run_of=3)
    assert {0, 1, 2, 3, 4} <= ver


def test_simulate_switches_when_most_of_pool_is_suspect():
    rows = [_row(0, 10 + i, None, "fail", ts=3.0, td=4.0) for i in range(16)]
    out = run.simulate(rows, list(range(16)), pilot=8)
    assert out["switched"] and out["gap"] == 0.0 and out["calls"] == 16


def test_simulate_keeps_rule_on_a_benign_pool():
    rows = [_row(100 - i, 100 - i, 0.8, ts=1.0, td=4.0) for i in range(32)]
    out = run.simulate(rows, list(range(32)), pilot=8)
    assert not out["switched"] and out["gap"] == 0.0 and out["calls"] <= 6
