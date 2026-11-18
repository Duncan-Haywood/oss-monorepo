"""Milestone 28: the shim as a mechanism."""
import math

import numpy as np

from buildbot_sheathing import ceiling as Q
from buildbot_sheathing import shim_mech as W

MM = 1e-3


def test_stack_residual_within_half_a_step_and_uniform_rms():
    h = np.random.default_rng(0).uniform(0, 8 * W.STEP_STACK, 200000)   # whole steps
    e = W.stack_residual(h)
    assert np.all(np.abs(e) <= W.STEP_STACK / 2 + 1e-12)
    assert math.isclose(np.sqrt(np.mean(e * e)), W.STEP_STACK / math.sqrt(12), rel_tol=0.01)


def test_frictionless_wedge_is_the_lever_rule():
    # no friction: the wedge carries m g / 2 and the push is V tan(alpha)
    f = W.wedge_force(1, 0.0, 0.0, 0.0)
    assert math.isclose(f["V"], W.MASS * W.G / 2, rel_tol=1e-9)
    assert math.isclose(f["P"], f["V"] * W.SLOPE, rel_tol=1e-9)
    # and it is not self-locking: backing it out takes a push the other way below zero
    assert W.wedge_force(-1, 0.0, 0.0, 0.0)["P"] > 0


def test_push_grows_with_friction_and_wedge_locks_above_its_slope():
    p = [W.wedge_force(1, mu, mu, mu)["P"] for mu in (0.1, 0.3, 0.5)]
    assert p[0] < p[1] < p[2]
    assert W.wedge_force(-1, 0.05, 0.05, 0.05)["P"] < 0          # mu1 + mu2 > tan(alpha): locks
    assert W.wedge_taps(0.01, 0.8)["out"] is None                  # too slick: backs out alone


def test_mu_drivable_inverts_the_push():
    mu = W.mu_drivable(65.6)
    assert math.isclose(W.wedge_force(1, mu, mu, mu)["P"], 65.6, rel_tol=2e-3)


def test_wedge_loop_ends_within_half_a_tap():
    f = W.wedge_taps(0.4, 0.8)
    e0 = -np.random.default_rng(1).uniform(0, 3 * MM, 300)
    m = 0.9
    r = W.wedge_loop(e0, f, 0.01, 0.1 * MM, m, cv_s=0.0)
    one = max(W.S.tap_closed(*f["in"], 0.01, 0.1 * MM, 200.0, m), W.S.tap_closed(*f["out"], 0.01, 0.1 * MM, 200.0, m))
    assert not r["capped"].any()
    assert np.all(np.abs(r["e"]) <= max(0.02 * MM, W.SLOPE * one / 2) * 1.01)


def test_callable_shim_in_ceiling_rounds_the_needed_lift():
    td = Q.theta_draw(shim=lambda h: W.stack_residual(h), s_edge=0.0)
    t = td(np.random.default_rng(2), 50000)
    assert np.all(np.abs(t) * W.W <= W.STEP_STACK / 2 + 1e-12)
    zero = Q.theta_draw(shim=lambda h: np.zeros_like(h), s_edge=0.0)(np.random.default_rng(2), 10)
    assert np.all(zero == 0)
