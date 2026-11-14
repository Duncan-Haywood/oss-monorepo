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
