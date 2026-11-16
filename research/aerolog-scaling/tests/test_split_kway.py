import importlib.util
import itertools
import os
import random

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


kw = _load("split_kway_test", "split_kway.py")
sc = _load("split_scale_test_11ad", "split_scale.py")


def _W(m, seed):
    rnd = np.random.default_rng(seed)
    W = rnd.random((m, m)) * (rnd.random((m, m)) < 0.8)
    return W


def _brute(W, k):
    m = W.shape[0]
    return min(float(kw.score(W, lab)) for lab in itertools.product(range(k), repeat=m))


def test_score_matches_split_scale_for_two_groups():
    m = 7
    W = _W(m, 1)
    w = {(i, j, "enr"): W[i, j] for i in range(m) for j in range(m)}
    w[(0, 1, "term")] = 99.0
    parts = sc.splits(m)
    s = sc.score_all(w, parts)
    for p, row in enumerate(parts):
        assert abs(float(kw.score(kw.matrix(w, m), row)) - s[p]) < 1e-9


def test_exhaustive_equals_brute_force():
    for m, k in ((5, 2), (6, 3), (6, 4)):
        Ws = np.stack([_W(m, s) for s in range(3)])
        arg, best = kw.exhaustive(Ws, k, chunk=50)
        for q in range(3):
            assert abs(best[q] - _brute(Ws[q], k)) < 1e-9
            assert abs(float(kw.score(Ws[q], arg[q])) - best[q]) < 1e-9
            assert arg[q][0] == 0


def test_exhaustive_two_groups_agrees_with_split_scale_pick():
    m = 9
    W = _W(m, 7)
    w = {(i, j, "enr"): W[i, j] for i in range(m) for j in range(m)}
    parts = sc.splits(m)
    _, best = kw.exhaustive(W[None], 2)
    assert abs(best[0] - sc.score_all(w, parts).min()) < 1e-9   # W >= 0, so the one-group labelling never wins


def test_local_search_finds_small_optimum():
    hits = 0
    for s in range(20):
        W = _W(8, 100 + s)
        _, best = kw.exhaustive(W[None], 3)
        _, ls = kw.local_search(W, 3, restarts=50, seed=s)
        assert ls >= best[0] - 1e-9
        hits += abs(ls - best[0]) < 1e-9
    assert hits == 20


def test_descend_is_a_local_minimum():
    W = _W(10, 3)
    lab = kw.descend(W, [random.Random(1).randrange(4) for _ in range(10)], 4)
    s0 = float(kw.score(W, lab))
    for i in range(10):
        for h in range(4):
            alt = list(lab)
            alt[i] = h
            assert float(kw.score(W, alt)) >= s0 - 1e-9


def test_recursive_bisection_valid_and_not_better_than_joint():
    for s in range(5):
        W = _W(8, 200 + s)
        lab = kw.recursive_bisection(W)
        assert len(lab) == 8 and max(lab) <= 3 and lab[0] == 0
        _, best = kw.exhaustive(W[None], 4)
        assert float(kw.score(W, lab)) >= best[0] - 1e-9
        a, b = kw.best_bisection(W, range(8))
        two = [0 if o in a else 1 for o in range(8)]
        assert float(kw.score(W, lab)) <= float(kw.score(W, two)) + 1e-9


def test_random_expected_is_mean_over_labellings():
    m, k = 5, 3
    W = _W(m, 9)
    allv = [float(kw.score(W, lab)) for lab in itertools.product(range(k), repeat=m)]
    assert abs(sum(allv) / len(allv) - kw.random_expected(W, k)) < 1e-9


def test_canonical():
    assert kw.canonical((2, 2, 0, 1, 0)) == (0, 0, 1, 2, 1)
