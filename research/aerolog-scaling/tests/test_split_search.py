import importlib.util
import itertools
import os

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("ss_test", os.path.join(HERE, "split_search.py"))
ss = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ss)

PARTS = [(0,) + b for b in itertools.product((0, 1), repeat=2)][1:]
W = {(0, 0, "enr"): 1.0, (1, 1, "enr"): 1.0, (2, 2, "enr"): 1.0,
     (0, 1, "enr"): 5.0, (0, 2, "enr"): 3.0, (1, 2, "enr"): 1.0}


def test_tiers_hold_and_fail():
    m = {"a": 1.0, "b": 1.01, "c": 1.05, "d": 1.2}
    assert ss.tiers_hold(m, [["a"], ["b", "c"], ["d"]])
    assert not ss.tiers_hold(m, [["a", "c"], ["b"], ["d"]])


def test_stake_is_mean_over_best():
    s = [ss.score(W, p) for p in PARTS]   # 4, 6, 8
    assert ss.stake(W, PARTS) == (sum(s) / 3) / 4.0 == 1.5


def test_boot_ci_brackets_mean_and_collapses_for_constant():
    x = [1.0, 2.0, 3.0, 4.0, 5.0] * 4
    lo, hi = ss.boot_ci(x)
    assert lo < 3.0 < hi
    assert ss.boot_ci([2.0] * 10) == (2.0, 2.0)


def test_median_even_and_odd():
    assert ss.median([3, 1, 2]) == 2
    assert ss.median([4, 1, 2, 3]) == 2.5
