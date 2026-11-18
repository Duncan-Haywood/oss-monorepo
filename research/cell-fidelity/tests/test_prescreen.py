import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "prescreen"
spec = importlib.util.spec_from_file_location("prescreen_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _row(score, dfn, r=0.5, kind="ok", t_spme=1.0, t_dfn=10.0):
    return dict(kind=kind, score=score, r=r, dfn=dfn, v0kind=kind, v0r=r, t_spme=t_spme, t_v0=t_spme, t_dfn=t_dfn, j=0)


def test_flagged_designs_are_verified_without_an_spme_score():
    rows = [_row(0, 50, r=None, kind="fail"), _row(90, 100), _row(80, 85), _row(70, 72), _row(60, 61)]
    kt = [-0.3, 0.5, 0.6, 0.7, 0.8]
    pick, ver, pre = run.prescreen(rows, kt)
    assert pre == [0] and 0 in ver and pick == 1


def test_a_flagged_design_can_be_the_answer():
    # the salt-edge design is the DFN best; the pre-screen still verifies it, so the answer is exact
    rows = [_row(0, 120, r=None, kind="fail"), _row(90, 100), _row(80, 85), _row(70, 72)]
    pick, ver, _ = run.prescreen(rows, [0.05, 0.5, 0.6, 0.7])
    assert pick == 0


def test_evaluate_prices_the_saved_spme_time_and_the_discard_screen():
    rows = [_row(0, 120, r=None, kind="fail", t_spme=5.0), _row(90, 100), _row(80, 85), _row(70, 72)]
    e = run.evaluate(rows, [0.05, 0.5, 0.6, 0.7], t_pred=0.2)
    assert e["spme_saved"] == 5.0 and e["n_pre"] == 1 and e["best_flagged"]
    assert abs(e["discard_gap"] - 20 / 120) < 1e-12
    assert e["ps_gap"] == 0.0 and e["agree"] == 1.0


def test_verdicts_follow_the_registered_ranges():
    base = dict(ps_gap=0.0, t_ps=1.0, t_band=1.0, best_rkt=0.3, agree=1.0)
    assert run.verdicts({"a": base}) == dict(H70="supported", H71="supported", H72="supported", H73="supported")
    v = run.verdicts({"a": dict(base, t_ps=0.8, best_rkt=0.9, agree=0.85, ps_gap=0.03)})
    assert v == dict(H70="refuted", H71="refuted", H72="refuted", H73="refuted")
    assert run.verdicts({"a": dict(base, t_ps=0.87)})["H71"] == "mixed"
