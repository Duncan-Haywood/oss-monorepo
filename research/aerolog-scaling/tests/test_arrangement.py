import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("arrangement_test", os.path.join(HERE, "arrangement.py"))
ar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ar)


def test_pair_weights_symmetric_zero_diagonal():
    W = np.array([[1.0, 2.0], [0.0, 3.0]])
    X = np.array([[0.0, 0.5], [1.0, 0.0]])
    w = ar.pair_weights(W, X)
    assert np.allclose(w, w.T) and w[0, 0] == 0 and w[1, 1] == 0
    assert abs(w[0, 1] - 3.5) < 1e-12


def test_adj_stat_weights_only_pairs_one_level_apart():
    b = np.array([0.0, 1.0, 5.0])
    lab = np.array([0, 1, 1])
    w = np.ones((3, 3)) - np.eye(3)
    # one level apart: (0,1) |1| and (0,2) |5|; same level (1,2) |4|
    assert abs(ar.adj_stat(b, lab, w) - 3.0) < 1e-12
    assert abs(ar.adj_stat(b, lab, w, d=0) - 4.0) < 1e-12
    w[0, 2] = w[2, 0] = 0.0
    assert abs(ar.adj_stat(b, lab, w) - 1.0) < 1e-12
    assert np.isnan(ar.adj_stat(b, np.array([0, 2, 4]), w))


def test_sorted_arrangement_beats_the_permutation_null():
    # offsets sorted along the levels: neighbours have the closest offsets, so A is below the permutation mean
    b = np.array([-4.7, -1.44, 0.81, 1.06, 1.55])
    lab = np.arange(5)
    w = np.ones((5, 5)) - np.eye(5)
    a = ar.adj_stat(b, lab, w)
    null = ar.perm_null(b, lab, w, 500, 1)
    assert a < null
    assert ar.far_share(b, lab, w) == 0.25            # only the -4.7 / -1.44 pair (3.26 m) exceeds 3 m
    # a constant offset leaves nothing to arrange
    assert ar.perm_null(np.full(5, 2.0), lab, w, 50, 2) == 0.0


def test_sign_p_exact():
    assert abs(ar.sign_p(0, 4) - 0.125) < 1e-12
    assert ar.sign_p(2, 4) == 1.0
    assert abs(ar.ratio(1.0, 2.0) - 0.5) < 1e-12 and np.isnan(ar.ratio(1.0, 0.0))


def test_posthoc_split_groups_by_scale_and_spacing():
    spec2 = importlib.util.spec_from_file_location("arrangement_posthoc_test", os.path.join(HERE, "arrangement_posthoc.py"))
    ph = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(ph)
    row = {"h": 13.333333, "A1": 1.0, "N1": 2.0, "A0": 3.0, "N0": 2.0}
    res = [{"m": 12, "cells": {"1.0": [row, dict(row, h=24.0)], "2.0": [row]}}]
    out = ph.split(res)
    assert out[(12, 1.0, 13.33)] == [(0.5, 1.5)]
    assert set(out) == {(12, 1.0, 13.33), (12, 1.0, 24.0), (12, 2.0, 13.33)}
