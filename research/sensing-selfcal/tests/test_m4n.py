"""Milestone 4n: the k1 + k2 twin matches the k1 + k2 solver on a TUM unit, and the analysis' own
twin_sets agrees with milestone 4i's where both apply and leaves sets without delete-one sets empty."""
import importlib.util, os, sys
import numpy as np
import pytest

HERE = os.path.dirname(__file__)
EXP = os.path.join(HERE, "..", "experiments", "m4n_k2")
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m4j_tum"))
import tumunit as tu  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4n_analyse", os.path.join(EXP, "analyse.py"))
m4n = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4n)


@pytest.fixture(scope="module")
def k2():
    m = m4n.m4j_module(2)
    obs, size, _ = tu.load("fr3")
    f0 = tu.f0("fr3")
    return m, m.twin.fit_all(obs, size, f0), obs, size, f0


def test_k2_twin_matches_the_k2_solver(k2):
    m, tw, obs, size, f0 = k2
    assert m.twin.NK == 2 and len(tw["intr"]) == 5
    s = tu.sc.selfcal_fixed_best(obs, size, f0, nk=2, refs=(0, 6))
    assert abs(tw["intr"][0] - s["f"]) < 1e-6 * s["f"]
    assert np.allclose(m.twin.project(tw, tuple(range(13))) - obs, tw["resid"])


def test_k2_gain_matches_a_small_nonlinear_perturbation(k2):
    m, tw, obs, size, f0 = k2
    v = (0, 2, 5, 8, 10, 12)
    clean = m.twin.project(tw, v)
    eps = np.random.default_rng(11).standard_normal(clean.size) * 0.03
    s = tu.sc.selfcal_fixed_best(clean + eps.reshape(clean.shape), size, f0, nk=2, refs=(0, 3))
    lin = m.twin.gain(tw, v) @ eps
    assert abs((s["f"] - tw["intr"][0]) - lin) < 0.05 * abs(lin) + 3e-3


def test_private_modules_keep_their_own_lens_model():
    a, b = m4n.m4j_module(1), m4n.m4j_module(2)
    assert (a.twin.NK, b.twin.NK) == (1, 2) and a.twin is not b.twin


def test_twin_sets_matches_m4i_and_skips_sets_without_delete_one_sets():
    m = m4n.m4j_module(1)
    rng = np.random.default_rng(3)
    sets = [s for n in (5, 6, 7) for s in __import__("itertools").combinations(range(13), n)]
    index = {m.twin.mask(s): i for i, s in enumerate(sets)}
    G = rng.standard_normal((len(sets), 20))
    E = rng.standard_normal((20, 50))
    F, J, R = m4n.twin_sets(m.m4g, G, index, E)
    i7 = index[m.twin.mask((0, 1, 2, 3, 4, 5, 6))]
    i5 = index[m.twin.mask((0, 1, 2, 3, 4))]
    assert np.all(np.isfinite(R[i7])) and np.all(np.isnan(R[i5]))
    loo = F[[index[m.twin.mask(tuple(x for x in range(7) if x != w))] for w in range(7)]].astype(float)
    Jref = 6 / 7 * ((loo - loo.mean(0)) ** 2).sum(0)
    assert np.allclose(J[i7], Jref, rtol=1e-5)


def test_spread_counts_far_solves():
    ok = lambda s: s is not None  # noqa: E731
    sols = {(i,): dict(f=100.0 + 0.1 * i) for i in range(20)}
    sols[(99,)] = dict(f=120.0)
    r = m4n.spread(sols, ok, 1)
    assert r["far"] == 1 and r["converged"] == 21 and r["rel_mad"] < 0.01
