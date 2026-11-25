import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from civ_seeding import bcdj, complex as cx  # noqa: E402


@pytest.fixture(scope="module")
def setup():
    V = bcdj.load()
    return V, bcdj.leader_logit(V)[0]


def test_information_model_matches_bcdj_port(setup):
    # gamma = 0, no threshold: same model as bcdj.simulate, different random stream
    V, beta = setup
    for v in V[:4]:
        a = bcdj.simulate(v, beta, 0.05, 0.3, 2000, np.random.default_rng(1)).mean()
        b = cx.simulate(v, beta, 0.05, 0.3, 2000, np.random.default_rng(2)).mean()
        assert abs(a - b) < 0.006


def test_gamma_zero_adopters_are_informed_low_u(setup):
    V, beta = setup
    v = V[0]
    rng = np.random.default_rng(5)
    Y, I = cx.simulate(v, beta, 0.05, 0.3, 50, rng, return_informed=True)
    assert (Y <= I).all()
    assert Y[v.leader].mean() == pytest.approx(bcdj.adopt_prob(v, beta)[v.leader].mean(), abs=0.03)


def test_reinforcement_raises_takeup_and_negative_lowers(setup):
    V, beta = setup
    v = V[1]
    m = [cx.simulate(v, beta, 0.05, 0.3, 300, np.random.default_rng(3), gamma=g).mean()
         for g in (-1.0, 0.0, 1.0)]
    assert m[0] < m[1] < m[2]


def test_threshold_off_above_one_and_lower_theta_adopts_more(setup):
    V, beta = setup
    v = V[2]
    off = cx.simulate(v, beta, 0.05, 0.3, 200, np.random.default_rng(4), theta=None)
    big = cx.simulate(v, beta, 0.05, 0.3, 200, np.random.default_rng(4), theta=1.5)
    assert (off == big).all()
    lo = cx.simulate(v, beta, 0.05, 0.3, 200, np.random.default_rng(4), theta=0.3).mean()
    hi = cx.simulate(v, beta, 0.05, 0.3, 200, np.random.default_rng(4), theta=1.0).mean()
    assert lo > hi >= off.mean()


def test_extended_moments_start_with_bcdj_five(setup):
    V, _ = setup
    v = V[3]
    y = v.takeup.astype(float)
    m = cx.moments_ext(v, y)
    assert m.shape == (8,)
    assert np.allclose(m[:5], bcdj.moments(v, y))
    nb = v.A @ y
    assert m[5] == pytest.approx(y[nb == 1].mean())


def test_loo_never_uses_held_out_village():
    rng = np.random.default_rng(0)
    D = rng.normal(size=(6, 5, 8)) * 0.1
    D_bad = D.copy()
    D_bad[:, 2] += 100.0  # a held-out village with huge divergence must not steer its own fit
    loss_a, idx_a = cx.loo_losses(D, D)
    loss_b, idx_b = cx.loo_losses(D_bad, D)
    assert idx_a[2] == idx_b[2]


def test_zero_shift_is_no_shift_and_shift_moves_takeup(setup):
    # village random effect: a zero shift reproduces the plain run draw for draw; a positive
    # shift raises take-up, a negative one lowers it, and the shift varies by run
    V, beta = setup
    v = V[4]
    base = cx.simulate(v, beta, 0.05, 0.3, 100, np.random.default_rng(6))
    zero = cx.simulate(v, beta, 0.05, 0.3, 100, np.random.default_rng(6), shift=np.zeros(100))
    assert (base == zero).all()
    up = cx.simulate(v, beta, 0.05, 0.3, 100, np.random.default_rng(6), shift=np.full(100, 1.0))
    dn = cx.simulate(v, beta, 0.05, 0.3, 100, np.random.default_rng(6), shift=np.full(100, -1.0))
    assert dn.mean() < base.mean() < up.mean()
    mixed = np.r_[np.full(50, -2.0), np.full(50, 2.0)]
    Y = cx.simulate(v, beta, 0.05, 0.3, 100, np.random.default_rng(6), shift=mixed)
    assert Y[:, :50].mean() < Y[:, 50:].mean()


def test_heterogeneous_threshold_tends_to_fixed_threshold(setup):
    # milestone 28: kappa -> infinity concentrates theta_i at mu, the fixed threshold
    V, beta = setup
    v = V[2]
    t = cx.simulate(v, beta, 0.075, 0.1, 1500, np.random.default_rng(4), theta=0.6).mean()
    h = cx.simulate(v, beta, 0.075, 0.1, 1500, np.random.default_rng(5),
                    theta_beta=(0.6, 1e6)).mean()
    assert abs(t - h) < 0.01


def test_heterogeneous_threshold_lower_mean_raises_takeup(setup):
    V, beta = setup
    v = V[3]
    m = [cx.simulate(v, beta, 0.075, 0.1, 400, np.random.default_rng(6),
                     theta_beta=(mu, 5.0)).mean() for mu in (0.3, 0.5, 0.75)]
    i = cx.simulate(v, beta, 0.075, 0.1, 400, np.random.default_rng(6)).mean()
    assert m[0] > m[1] > m[2] > i


def test_heterogeneous_threshold_adopters_are_informed(setup):
    V, beta = setup
    v = V[0]
    Y, I = cx.simulate(v, beta, 0.05, 0.3, 60, np.random.default_rng(7), return_informed=True,
                       theta_beta=(0.4, 2.0))
    assert (Y <= I).all()


def test_latent_field_unit_variance_and_neighbour_correlation(setup):
    # milestone 29: per-household variance sigma^2; neighbours correlated for rho > 0
    V, _ = setup
    v = V[1]
    z = cx.latent_field(v, 2.0, 2.0, 4000, np.random.default_rng(8))
    assert abs(z.var(1).mean() - 4.0) < 0.15
    i, j = np.argwhere(np.triu(v.A) > 0).T
    zn = z / z.std(1, keepdims=True)
    c = (zn[i] * zn[j]).mean(1).mean()
    z0 = cx.latent_field(v, 2.0, 0.0, 4000, np.random.default_rng(8))
    zn0 = z0 / z0.std(1, keepdims=True)
    assert c > 0.2 and abs((zn0[i] * zn0[j]).mean(1).mean()) < 0.02


def test_latent_sigma_zero_is_information_model(setup):
    V, beta = setup
    v = V[0]
    # the field's draws shift the spread stream, so compare take-up, not draws
    a = cx.simulate(v, beta, 0.05, 0.3, 2000, np.random.default_rng(9))
    b = cx.simulate(v, beta, 0.05, 0.3, 2000, np.random.default_rng(10), latent=(0.0, 2.0))
    assert abs(a.mean() - b.mean()) < 0.01


def test_latent_homophily_adopters_are_informed(setup):
    V, beta = setup
    v = V[0]
    Y, I = cx.simulate(v, beta, 0.05, 0.3, 60, np.random.default_rng(7), return_informed=True,
                       latent=(2.0, 2.0))
    assert (Y <= I).all()


def test_mixed_family_nests_homophily_and_adds_adopters(setup):
    # milestone 31: M = latent propensity plus reinforcement. gamma = 0 is L draw for draw; with
    # qP >= qN and common random numbers, a positive gamma can only add adopters (coupling).
    V, beta = setup
    v = V[0]
    kw = dict(delta=-0.5, latent=(1.5, 8.0))
    L = cx.simulate(v, beta, 0.1, 0.2, 80, np.random.default_rng(31), **kw)
    M0 = cx.simulate(v, beta, 0.1, 0.2, 80, np.random.default_rng(31), gamma=0.0, **kw)
    M = cx.simulate(v, beta, 0.1, 0.2, 80, np.random.default_rng(31), gamma=0.2, **kw)
    assert (M0 == L).all()
    assert (M >= L).all() and M.mean() > L.mean()
