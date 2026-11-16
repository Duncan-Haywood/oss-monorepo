import importlib.util
import os
import random

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sc = _load("split_scale_test", "split_scale.py")
gp = _load("graph_partition_test_11ac", "graph_partition.py")


def _random_w(m, seed):
    rnd = random.Random(seed)
    w = {}
    for i in range(m):
        for j in range(i, m):
            w[(i, j, "enr")] = rnd.random()
            if rnd.random() < 0.3:
                w[(j, i, "enr")] = rnd.random()   # both orientations, as the closed-form dicts can carry
            w[(i, j, "term")] = 100.0             # other zones must be ignored
    return w


def test_splits_match_graph_partition_order():
    for m in (3, 5, 8):
        got = [tuple(int(v) for v in row) for row in sc.splits(m)]
        assert got == gp.bipartitions(m)[1:]
    assert sc.splits(12).shape == (2047, 12)


def test_score_all_equals_dict_score():
    for m, seed in ((4, 1), (8, 2), (12, 3)):
        w = _random_w(m, seed)
        parts = sc.splits(m)
        s = sc.score_all(w, parts)
        ref = np.array([gp.score(w, tuple(int(v) for v in p)) for p in parts])
        assert np.allclose(s, ref, rtol=1e-12, atol=1e-12)


def test_pick_matches_dict_best():
    for seed in range(5):
        w = _random_w(8, 10 + seed)
        parts = sc.splits(8)
        p = sc.pick(w, parts)
        assert tuple(int(v) for v in parts[p]) == gp.best(gp.bipartitions(8)[1:], w)


def test_moved_is_up_to_relabelling():
    assert sc.moved((0, 0, 1, 1), (0, 0, 1, 1)) == 0
    assert sc.moved((0, 0, 1, 1), (1, 1, 0, 0)) == 0
    assert sc.moved((0, 0, 1, 1), (0, 1, 1, 1)) == 1
    assert sc.moved((0, 0, 0, 1, 1, 1), (0, 1, 0, 1, 0, 1)) == 2


def test_tiers_and_median():
    assert sc.tiers_hold({"a": 1.0, "b": 1.1, "c": 1.2}, [["a"], ["b"], ["c"]])
    assert not sc.tiers_hold({"a": 1.0, "b": 1.1, "c": 1.05}, [["a"], ["b"], ["c"]])
    assert sc.median([3, 1, 2]) == 2 and sc.median([1, 2, 3, 4]) == 2.5
