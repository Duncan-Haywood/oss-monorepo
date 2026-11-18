"""Milestone 4i's twin: its gains match the solver's response, are gauge-free, and give a calibrated reference."""
import importlib.util, os, sys
import numpy as np
import pytest

HERE = os.path.dirname(__file__)
EXP = os.path.join(HERE, "..", "experiments", "m4i_geomref")
sys.path.insert(0, EXP)
import twin  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4i", os.path.join(EXP, "analyse.py"))
m4i = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4i)


@pytest.fixture(scope="module")
def left():
    return m4i.load_cam("left")


def test_twin_reproduces_the_stored_13_view_solve(left):
    tw, obs, size, f0 = left
    assert abs(tw["intr"][0] - 534.3362536171205) < 1e-6
    assert np.allclose(twin.project(tw, tuple(range(13))) - obs, tw["resid"])


def test_gain_matches_a_small_nonlinear_perturbation(left):
    tw, obs, size, f0 = left
    v = (1, 3, 6, 9, 12)
    clean = twin.project(tw, v)
    eps = np.random.default_rng(7).standard_normal(clean.size) * 0.03
    s = twin.sc.selfcal_fixed_best(clean + eps.reshape(clean.shape), size, f0, nk=1, refs=(0, 2))
    lin = twin.gain(tw, v) @ eps
    assert abs((s["f"] - tw["intr"][0]) - lin) < 0.02 * abs(lin) + 1e-3


def test_gain_does_not_depend_on_the_gauge_view(left):
    tw = left[0]
    v = (0, 4, 7, 10)
    g = twin.gain(tw, v).reshape(4, -1)
    perm = (7, 0, 10, 4)          # a different first (fixed) view
    gp = twin.gain(tw, perm).reshape(4, -1)
    for j, view in enumerate(perm):
        assert np.allclose(gp[j], g[v.index(view)], rtol=1e-6, atol=1e-9)


def test_resid_noise_is_unit_scale_and_reuses_the_units_patterns(left):
    tw = left[0]
    E = twin.noise(np.random.default_rng(0), "resid", 500, tw)
    assert E.shape == (13 * 108, 500)
    assert 0.8 < np.sqrt(np.mean(E ** 2)) < 1.2
    pats = tw["resid"].reshape(13, 108)
    pats = pats / np.sqrt(np.mean(pats ** 2))
    col = E[:108, 0]
    assert min(min(np.abs(col - p).max(), np.abs(col + p).max()) for p in pats) < 1e-12


def test_per_split_reference_is_calibrated_on_twin_draws(left):
    tw = left[0]
    G, idx = twin.gain_matrix(tw, sizes=(3, 4, 5))
    old, new = twin.mask((0, 2, 4, 6, 8)), twin.mask((1, 5, 9, 11))
    sets_a = m4i.twin_sets(G, idx, twin.noise(np.random.default_rng(1), "iid", 20_000))
    sets_b = m4i.twin_sets(G, idx, twin.noise(np.random.default_rng(2), "iid", 20_000))
    qR, _, _, _ = m4i.references(sets_a, sets_a, idx, idx, np.array([old]), np.array([new]))
    F, _, R = sets_b
    z = (F[idx[new]].astype(float) - F[idx[old]]) ** 2 / (R[idx[old]] + R[idx[new]])
    assert 0.006 < np.mean(z > qR[0]) < 0.014
