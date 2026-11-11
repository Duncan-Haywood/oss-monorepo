import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "cycles"
spec = importlib.util.spec_from_file_location("cycles_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_score_at_reads_cycle_n_and_zeroes_short_runs():
    r = dict(ok_cycles=3, cycle_wh=[10.0, 9.0, 8.0])
    assert run.score_at(r, 2, 0.5) == 18.0
    assert run.score_at(r, 3, 0.5) == 16.0
    assert run.score_at(r, 10, 0.5) == 0.0  # stopped before cycle 10
    assert run.score_at(dict(ok_cycles=0, cycle_wh=[]), 2, 1.0) == 0.0
    assert run.score_at(dict(ok_cycles=2, cycle_wh=[1.0, 0.0]), 2, 1.0) == 0.0  # no energy in cycle 2


def test_top_overlap_and_screen_verify():
    a = [5, 4, 3, 2, 1]
    b = [1, 4, 3, 2, 5]
    assert run.top_overlap(a, b, 2) == 1
    assert run.screen_verify(a, b, 1) == 1
    assert run.screen_verify(a, b, 2) == 4
    assert run.screen_verify(a, b, 5) == 5


def test_spearman_ties_and_constant():
    assert abs(run.spearman([1, 2, 3], [2, 4, 6]) - 1) < 1e-12
    assert run.ranks([0, 0, 2]) == [0.5, 0.5, 2.0]
    assert run.spearman([1, 1, 1], [1, 2, 3]) != run.spearman([1, 1, 1], [1, 2, 3])  # nan


def test_bootstrap_interval_brackets_point():
    xs = list(range(50))
    lo, hi = run.bootstrap(lambda idx: sum(xs[i] for i in idx) / len(idx), len(xs), n=500)
    assert lo < 24.5 < hi


def test_committed_benchmark_is_complete_and_paired():
    path = HERE / "bench.jsonl"
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    keys = {(r["j"], r["model"]) for r in rows}
    assert keys == {(j, m) for j in range(2 ** run.N_SOBOL_LOG2) for m in run.MODELS}
    for r in rows:
        assert r["ok_cycles"] <= 100 and len(r["cycle_wh"]) == r["ok_cycles"]


def test_committed_prefix_check_holds():
    p = json.loads((HERE / "prefix.json").read_text())
    for m in run.MODELS:
        assert p[m]["max_rel_diff_first10"] < 1e-3
    assert abs(p["SPMe"]["score100"] - 109.14) / 109.14 < 0.005
    assert abs(p["DFN"]["score100"] - 116.26) / 116.26 < 0.005
