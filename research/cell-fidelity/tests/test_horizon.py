import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "horizon"
spec = importlib.util.spec_from_file_location("horizon_run", EXP / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def rec(wh, mass=0.05, done=None):
    return dict(cycle_wh=wh, mass_kg=mass, cycles_done=len(wh) if done is None else done,
                cycle_end_s=[1.0 + k for k in range(len(wh))])


def test_score_at_matches_energy_cell_rule():
    r = rec([16.0, 10.0, 9.0])
    assert run.score_at(r, 2) == 10.0 / 0.05
    assert run.score_at(r, 3) == 9.0 / 0.05
    assert run.score_at(r, 4) == 0.0          # run stopped before cycle 4
    assert run.score_at(rec([16.0, 0.0, 9.0]), 3) == 0.0  # cycle-2 energy not positive: energy-cell fails it
    assert run.score_at(dict(cycle_wh=[], mass_kg=0.05, cycles_done=0), 2) == 0.0


def test_time_at_and_median():
    r = rec([1.0] * 5)
    assert run.time_at(r, 3) == 3.0 and run.time_at(r, 9) is None
    assert run.median([3, None, 1, 2]) == 2 and run.median([1, 2, 3, 4]) == 2.5 and run.median([None]) is None


def test_extrapolate_is_linear_and_floored():
    r = rec([0.0, 10.0] + [9.0] * 7 + [9.6])  # cycles 2 and 10: 200 and 192 Wh/kg
    assert abs(run.extrapolate(r) - (192.0 - 8.0 * 90 / 8)) < 1e-9
    steep = rec([0.0, 10.0] + [1.0] * 8)
    assert run.extrapolate(steep) == 0.0


def test_screen_regret():
    assert run.screen_regret([3, 2, 1], [1, 5, 9], 1) == (1, 8)
    assert run.screen_regret([3, 2, 1], [1, 5, 9], 3) == (9, 0)


def test_committed_results_are_internally_consistent():
    s = json.loads((EXP / "summary.json").read_text())["rungs"]
    for name, v in s.items():
        assert -1.0 <= v["spearman"] <= 1.0
        assert all(g >= 0 for g in v["regret"].values())
    lines = (EXP / "horizon.jsonl").read_text().splitlines()
    assert len(lines) == 49 * 3
    assert {json.loads(l)["model"] for l in lines} == {"SPM", "SPMe", "DFN"}
