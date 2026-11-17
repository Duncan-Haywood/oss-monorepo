import importlib.util
import math
import os

import pytest

np = pytest.importorskip("numpy")

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("ref_mix_test", os.path.join(HERE, "ref_mix.py"))
rm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rm)
ll = rm.ll


def _WXV(m, seed):
    rng = np.random.default_rng(seed)
    W, X, V = rng.random((m, m)), rng.random((m, m)) * 1.5, rng.random((m, m)) * 0.3
    np.fill_diagonal(V, 0.0)
    return W, X, V


def test_metres_per_hpa():
    assert 8.2 < rm.M_PER_HPA < 8.4


def test_p_gap_matches_level_leak_at_independent_errors():
    for g in (0.0, 3.0, 7.62, 13.0, 20.0):
        assert abs(rm.p_gap(g, 7.62, 1.0 * math.sqrt(2)) - ll.p_overlap(g, 7.62, 1.0)) < 1e-12


def test_zero_mismatch_reduces_to_level_leak():
    W, X, V = _WXV(8, 1)
    cls = rm.classes(8, 0.5, 3)
    P = rm.Problem(W, X, V, cls, 9.0, 7.62, 1.0, 0.0, 4)
    pw, px = ll.level_weights(9.0, 7.62, 1.0, 4)
    for lab in [(0, 1, 2, 3, 0, 1, 2, 3), (3, 3, 0, 0, 1, 2, 1, 0)]:
        assert abs(P.score(lab) - ll.score(W, X, V, lab, pw, px)) < 1e-9


def test_all_mix_equals_level_leak_at_effective_sigma():
    # if the mixed sd applied to every pair it would be level_leak at sigma_eff = sqrt(sigma^2 + sigma_m^2 / 2)
    W, X, V = _WXV(6, 2)
    sig, sm = 1.0, 3.0
    P = rm.Problem(W, X, V, np.zeros(6, dtype=bool), 11.0, 7.62, sig, sm, 4)
    P.pws, P.pxs = P.pwm, P.pxm
    pw, px = ll.level_weights(11.0, 7.62, math.sqrt(sig ** 2 + sm ** 2 / 2), 4)
    lab = (0, 2, 1, 3, 3, 0)
    assert abs(P.score(lab) - ll.score(W, X, V, lab, pw, px)) < 1e-9


def test_classes_count_and_seed():
    c = rm.classes(12, 0.25, 7)
    assert c.sum() == 3
    assert (c == rm.classes(12, 0.25, 7)).all()


def test_search_matches_exhaustive_and_mismatch_never_helps():
    W, X, V = _WXV(7, 4)
    cls = rm.classes(7, 0.5, 1)
    P = rm.Problem(W, X, V, cls, 8.0, 7.62, 1.0, 3.0, 3)
    lab, f = P.search(restarts=40)
    _, fe = P.exhaustive()
    assert abs(f - fe) <= 1e-9 * fe
    P0 = rm.Problem(W, X, V, cls, 8.0, 7.62, 1.0, 0.0, 3)
    # mixed pairs at different levels always leak more with a larger mismatch
    assert P.pxm[1] > P0.pxm[1] and P.pwm[1] >= P0.pwm[1]


def test_descent_is_local_optimum():
    W, X, V = _WXV(8, 5)
    cls = rm.classes(8, 0.5, 2)
    P = rm.Problem(W, X, V, cls, 10.0, 7.62, 1.0, 5.0, 5)
    lab = P.descend((0,) * 8)
    f = P.score(lab)
    for i in range(8):
        for a in range(5):
            l2 = list(lab)
            l2[i] = a
            assert P.score(l2) >= f - 1e-9


def test_segregated_and_spacer():
    cls = np.array([True, True, False, False])
    assert rm.segregated((0, 1, 1, 2), cls)
    assert rm.segregated((2, 3, 0, 1), cls)
    assert not rm.segregated((0, 2, 1, 3), cls)
    assert rm.spacer_at_interface((0, 0, 2, 3), cls)
    assert not rm.spacer_at_interface((0, 1, 2, 3), cls)
    assert not rm.spacer_at_interface((0, 1, 1, 3), cls)


def test_hgrid_contains_band_count_spacings():
    g = rm.hgrid()
    assert any(abs(h - 120 / 9) < 1e-6 for h in g) and 13.0 in g and g == tuple(sorted(g))


def test_incremental_descent_matches_reference():
    for seed in range(6):
        m = 9 + seed
        W, X, V = _WXV(m, 20 + seed)
        cls = rm.classes(m, 0.5, seed)
        P = rm.Problem(W, X, V, cls, 9.0 + seed, 7.62, 1.0, 3.0, 5)
        rng = np.random.default_rng(seed)
        for _ in range(5):
            s0 = tuple(int(x) for x in rng.integers(0, 5, m))
            a, b = P.descend(s0), P.descend_ref(s0)
            assert abs(P.score(a) - P.score(b)) <= 1e-9 * P.score(b)
