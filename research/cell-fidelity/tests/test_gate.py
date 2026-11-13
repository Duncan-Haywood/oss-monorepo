import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "gate"
spec = importlib.util.spec_from_file_location("gate_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _row(score, dfn, r=0.5, kind="ok", v0kind=None, v0r="same", t_v0=1.0, t_dfn=10.0):
    return dict(kind=kind, score=score, r=r, dfn=dfn, v0kind=v0kind or kind, v0r=r if v0r == "same" else v0r,
                t_spme=t_v0, t_v0=t_v0, t_dfn=t_dfn, j=0)


def test_suspect_is_failure_or_low_r_but_not_a_stop():
    assert run.suspect(_row(0, 100, r=None, kind="fail", v0r=None))
    assert run.suspect(_row(90, 100, r=0.1))
    assert not run.suspect(_row(90, 100, r=0.11))
    assert not run.suspect(_row(99, 100, r=0.7, kind="rescued", v0kind="stop"))


def test_gate_reads_only_the_first_n_designs():
    bad = [_row(0, 100, r=None, kind="fail", v0r=None)] * 3
    good = [_row(100, 100)] * 5
    assert not run.gate(bad + good + bad * 10)
    assert run.gate(bad + [_row(90, 100, r=0.05)] + good)


def test_iterate_answer_verifies_the_leader_until_it_is_verified():
    rows = [_row(100, 100), _row(130, 105), _row(120, 110), _row(50, 60)]
    pick, ver = run.iterate_answer(rows, [0])
    assert pick == 2 and ver == {0, 1, 2}
    pick, ver = run.iterate_answer(rows, [0, 1, 2, 3])
    assert pick == 2 and ver == {0, 1, 2, 3}


def test_evaluate_skip_branch_pays_the_gate_probe_plus_all_dfn():
    rows = [_row(0, 100 + i, r=None, kind="fail", v0r=None) for i in range(8)] + [_row(100, 100) for _ in range(8)]
    e = run.evaluate(rows)
    assert e["skip"] and e["gated_pick_gap"] == 0
    assert e["t_gated"] == 8 * 1.0 + 16 * 10.0
    assert e["t_all"] == 160.0


def test_evaluate_rule_branch_and_gate_right():
    rows = [_row(100 + i, 100 + i, r=0.5 + i / 100) for i in range(16)]
    e = run.evaluate(rows)
    assert not e["skip"] and e["cheaper"] == "rule" and e["gate_right"] is True
    assert e["gated_pick_gap"] == 0 and e["recall"] is None


def test_verdicts_h46_counts_wrong_calls_and_h50_direction():
    base = dict(gated_ratio=1.0, recall=None, skip=False, n_bad=0, gated_pick_gap=0.0)
    C = {"a": dict(base, gate_right=False, set="OKane2022", rate=2.0, suspect_share=0.10),
         "b": dict(base, gate_right=True, set="Ai2020", rate=0.5, suspect_share=0.70),
         "c": dict(base, gate_right=None, set="Marquis2019", rate=2.0, suspect_share=0.0)}
    v = run.verdicts(C)
    assert v["H46"] == "mixed" and v["H50"] == "mixed" and v["H47"] == "supported" and v["H48"] == "untestable"
    C["b"]["gate_right"] = False
    assert run.verdicts(C)["H46"] == "refuted"


def test_same_fidelity_answer_compares_screen_with_screen():
    rows = [_row(80, 100), _row(85, 120), _row(70, 90)]
    pick, ver = run.same_fidelity_answer(rows, [0])
    assert pick == 1 and ver == {0, 1}


def test_cost_gate_adds_time_ratio_to_suspect_share():
    rows = [_row(0, 100, r=None, kind="fail", v0r=None, t_v0=0.5, t_dfn=10.0)] * 3 + [_row(100, 100, t_v0=5.0)] * 5
    skip, pred = run.cost_gate(rows)
    assert abs(pred - ((1.5 + 25.0) / 8 / 10.0 + 3 / 8)) < 1e-12 and not skip


def test_affine_answer_uses_identity_below_three_points():
    rows = [_row(100, 100), _row(130, 105), _row(120, 110)]
    pick, ver = run.affine_answer(rows, [0])
    assert pick == 2 and ver == {0, 1, 2}
