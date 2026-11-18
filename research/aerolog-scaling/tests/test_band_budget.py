import importlib.util
import itertools
import os

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bc = _load("band_cost_budget_test", "band_cost.py")
bb = _load("band_budget_test", "band_budget.py")


def _WV(m, seed, vscale=0.3):
    rng = np.random.default_rng(seed)
    W = rng.random((m, m))
    V = rng.random((m, m)) * vscale
    np.fill_diagonal(V, 0.0)
    return W, V


def test_k_cap_counts_levels():
    # 2k levels spaced h need (2k - 1) h of depth
    for H, h in itertools.product((10.0, 30.0, 60.0, 90.0, 120.0), (7.62, 15.24, 30.48)):
        k = bb.k_cap(H, h)
        if H >= h:
            assert (2 * k - 1) * h <= H + 1e-9
            assert (2 * (k + 1) - 1) * h > H
        else:
            assert k == 1
    assert bb.k_cap(120.0, 7.62) == 8 and bb.k_cap(60.0, 7.62) == 4
    assert bb.k_cap(120.0, 15.24) == 4 and bb.k_cap(120.0, 30.48) == 2
    assert bb.k_cap(120.0, 7.62, m=6) == 6


def test_tau_sourced_values():
    assert abs(bb.tau_of(7.62) - 0.5 * 7.62 * (1 / 5 + 1 / 4)) < 1e-12
    assert abs(bb.tau_of(7.62) - 1.7145) < 1e-4
    assert abs(bb.CEILING_M - 121.92) < 1e-9


def test_F_monotone_in_tau_for_fixed_labels():
    rng = np.random.default_rng(3)
    m = 7
    W = rng.random((m, m))
    A, B = rng.random((m, m)), rng.random((m, m))
    np.fill_diagonal(A, 0)
    np.fill_diagonal(B, 0)
    T = {"A": A, "B": B}
    for _ in range(20):
        lab = tuple(rng.integers(0, 4, m))
        Fs = [float(bc.score(W, bc.V_of(T, t), lab)) for t in (0.0, 1.7, 3.4, 6.9)]
        assert all(a <= b + 1e-12 for a, b in zip(Fs, Fs[1:]))


def test_insert_slot_shifts_upper_bands():
    assert bb.insert_slot((0, 1, 2, 1), 1) == (0, 2, 3, 2)
    assert bb.insert_slot((0, 1, 2), 3) == (0, 1, 2)
    assert bb.insert_slot((0, 1, 2), 0) == (1, 2, 3)


def test_insert_band_never_worse_and_is_local_optimum():
    for seed in range(5):
        W, V = _WV(8, seed)
        lab, F0 = bc.search_bands(W, V, 2, restarts=20)
        new, F, slot, moved = bb.insert_band(bc, W, V, lab)
        assert F <= F0 + 1e-9
        assert max(new) + 1 <= 3
        assert abs(F - float(bc.score(W, V, new))) < 1e-9


def test_grow_monotone_and_close_to_exhaustive_on_small_case():
    W, V = _WV(6, 11)
    g = bb.grow(bc, W, V, 3)
    Fs = [g[k][1] for k in (1, 2, 3)]
    assert all(b <= a + 1e-9 for a, b in zip(Fs, Fs[1:]))
    _, Fex = bc.exhaustive_bands(W, V, 3)
    assert Fex <= g[3][1] + 1e-9
    assert g[3][1] <= 1.25 * Fex
