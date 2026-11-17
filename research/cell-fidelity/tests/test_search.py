import importlib.util
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "search"
spec = importlib.util.spec_from_file_location("search_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

COST = {("SPM", 2): 1.0, ("DFN", 2): 2.0, ("DFN", 10): 4.0, ("DFN", 30): 8.0, ("DFN", 100): 20.0}


def toy():
    target = [100.0, 150.0, 120.0, 90.0]
    sc = {("DFN", 100): target, ("SPM", 2): [1, 4, 3, 2], ("DFN", 2): [10, 13, 14, 9],
          ("DFN", 10): [10, 15, 12, 9], ("DFN", 30): [10, 15, 12, 9]}
    return dict(target=target, sc=sc, cost=COST, rmin=[0.5, 0.5, 0.5, 0.0])


def test_trace_and_hit_time():
    tr = run.Trace([5.0, 7.0], COST)
    tr.charge(("SPM", 2), 0)
    tr.charge(("DFN", 100), 0)
    tr.charge(("DFN", 100), 1)
    assert tr.pts == [(0.0, 0.0), (1.0, 0.0), (21.0, 5.0), (41.0, 7.0)]
    assert tr.order == [0, 1]
    assert run.t_hit(tr.pts, 6.9) == 41.0
    assert run.t_hit(tr.pts, 8.0) == math.inf
    assert run.best_at(tr.pts, 30) == 5.0


def test_screen_charges_pool_then_verifies_in_screen_order():
    D = toy()
    tr = run.m_screen([0, 1, 2, 3], D, ("SPM", 2))
    assert tr.order == [1, 2, 3, 0]
    assert run.t_hit(tr.pts, 150.0) == 4 * 1.0 + 20.0


def test_flag_moves_flagged_designs_forward():
    D = toy()
    old = run.TOPK_FLAG
    run.TOPK_FLAG = 1
    try:
        tr = run.m_screen([0, 1, 2, 3], D, ("SPM", 2), flag=True)
    finally:
        run.TOPK_FLAG = old
    assert tr.order == [1, 3, 2, 0]  # top 1, then flagged design 3, then the rest in screen order


def test_halving_rungs_and_resumed_cost():
    D = toy()
    pool = [0, 1, 2, 3]
    tr = run.m_halving(pool, D)
    # 4 at DFN@2, 1 survivor (4 // 3) at DFN@10, 30 and 100: design 2 (best at cycle 2)
    assert tr.order[0] == 2
    assert run.t_hit(tr.pts, 120.0) == 4 * 2 + 4 + 8 + 20
    assert set(tr.order) == set(pool)
    tri = run.m_halving(pool, D, incremental=True)
    assert run.t_hit(tri.pts, 120.0) == 4 * 2 + (4 - 2) + (8 - 4) + (20 - 8)
    assert tri.done_hi == set(pool)


def test_random_verifies_everything_once():
    D = toy()
    tr = run.m_random([0, 1, 2, 3], D, random.Random(0))
    assert sorted(tr.order) == [0, 1, 2, 3]
    assert tr.t == 80.0


def test_median_and_committed_summary():
    assert run.med([3, 1, 2]) == 2 and run.med([1, 2, 3, 4]) == 2.5
    s = json.loads((HERE / "summary.json").read_text())
    assert s["seeds"] == 30 and s["pool"] == 64
    m = s["methods"]
    # H7 as committed: screening the whole pool at DFN@10 is slower than GP-EI on DFN
    assert m["screen DFN@10"]["T1_median"] > m["GP-EI DFN@100"]["T1_median"]
    assert m["screen SPM@2"]["T1_median"] < m["GP-EI DFN@100"]["T1_median"]
