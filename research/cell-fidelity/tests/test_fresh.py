import importlib.util
import json
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1] / "experiments" / "fresh"
spec = importlib.util.spec_from_file_location("fresh_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_fresh_designs_differ_from_seed_zero_and_restore_seed():
    np = pytest.importorskip("numpy")
    pytest.importorskip("scipy")
    a = run.fresh_designs()
    assert run.CR.SOBOL_SEED == 0
    b = run.CR.designs()
    assert len(a) == len(b) == 128
    assert np.min(run.nn_dist(a, b, [0] * 4, [1] * 4)) > 0


def test_nn_dist_normalises_by_bounds():
    d = run.nn_dist([[0.0, 0.0]], [[10.0, 0.0], [0.0, 1.0]], [0.0, 0.0], [10.0, 2.0])
    assert d == [pytest.approx(0.5)]


def test_rank_of_best():
    assert run.rank_of_best([3, 2, 1], [0, 0, 9]) == 3
    assert run.rank_of_best([1, 2, 3], [0, 0, 9]) == 1


def test_spearman_diff_ci_zero_for_identical_screens():
    t = list(range(20))
    s = [v + (i % 3) for i, v in enumerate(t)]
    d, lo, hi = run.spearman_diff_ci(s, s, t, n=50)
    assert d == 0 and lo == 0 and hi == 0


def test_scores_use_milestone_two_rule():
    rows = {0: {m: dict(ok_cycles=100, cycle_wh=[1.0, 2.0] + [3.0] * 98, mass_kg=0.5) for m in run.CR.MODELS}}
    sc = run.scores(rows)
    assert sc[("DFN", 2)] == [4.0] and sc[("SPM", 100)] == [6.0]


def test_committed_bench_is_complete_if_present():
    p = HERE / "bench.jsonl"
    if not p.exists():
        pytest.skip("bench not run")
    rows = run.load_rows(p)
    assert len(rows) == 128 and all(set(v) == set(run.CR.MODELS) for v in rows.values())
    assert all(r["x"] == rows[j]["DFN"]["x"] for j, v in rows.items() for r in v.values())


def test_summary_hypotheses_recorded_if_present():
    p = HERE / "summary.json"
    if not p.exists():
        pytest.skip("report not run")
    h = json.loads(p.read_text())["hypotheses"]
    assert set(h) >= {"H25", "H26", "H27", "H28"}
