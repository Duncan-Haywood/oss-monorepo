import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "fade"
spec = importlib.util.spec_from_file_location("fade_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_at_k_reads_the_kth_cycle():
    assert run.at_k([10.0, 9.0, 8.0], 0.5, 2) == 18.0


def test_sqrt_extrapolation_recovers_an_exact_sqrt_fade():
    wh = [12.0] + [10.0 - 0.3 * math.sqrt(c) for c in range(2, 101)]
    assert abs(run.sqrt_extrapolate(wh, 10, 100) - (10.0 - 3.0)) < 1e-9


def test_screen_charges_short_runs_on_all_and_long_runs_on_the_top_m():
    rows = [dict(score=s, short=h, tk=1.0, t100=10.0) for s, h in ((50, 9), (60, 8), (40, 7), (70, 1))]
    gap, top, t = run.screen(rows, m=2)
    assert top == [0, 1] and abs(gap - (1 - 60 / 70)) < 1e-12 and t == 4 * 1.0 + 2 * 10.0
    gap, top, t = run.screen(rows, m=1, subset=[2, 3])
    assert top == [2] and t == 2 * 1.0 + 10.0


def test_verdicts_follow_the_registered_thresholds():
    c = dict(rho_short=0.9, gap=0.0, t_ratio=0.2, front_gap=0.01)
    v = run.verdicts({"a": c, "b": dict(c, rho_short=0.4, gap=0.05, t_ratio=0.3, front_gap=0.0)})
    assert v == dict(H78="refuted", H79="mixed", H80="mixed", H81="refuted")


def test_committed_dev_replay_is_consistent():
    import json
    d = json.loads((HERE / "dev.json").read_text())
    assert len(d["conditions"]) == 24
    for c in d["conditions"].values():
        assert 0 <= c["gap"] <= c["top1"]["gap"] + 1e-12
        assert c["t_ratio"] < 1
