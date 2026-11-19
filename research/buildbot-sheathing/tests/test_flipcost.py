import itertools

import numpy as np

from buildbot_sheathing import preload as PL
from buildbot_sheathing.pose_range import held_bias

TF = 0.2


def test_far_from_threshold_costs_nothing():
    c = PL.flip_cost([0.6, -0.6, 0.0], [0.7, -0.5, 0.05], 0.1, 0.1, TF, 1e-3, [1.0, 2.0, 3.0])
    assert np.allclose(c, 0.0)


def test_near_threshold_costs_half_gap_times_row():
    c = PL.flip_cost([0.21], [0.5], 0.05, 0.05, TF, 2e-3, [-3.0])
    assert np.isclose(c[0], 3.0 * 1e-3)


def test_side_flip_reachable_costs_full_gap():
    c = PL.flip_cost([0.25], [0.25], 0.5, 0.5, TF, 2e-3, [1.0])
    assert np.isclose(c[0], 2e-3)


def test_zero_radius_matches_planned_state():
    pos, neg, free = PL.reachable_states([0.3, -0.3, 0.1], [0.3, -0.3, 0.1], 0.0, 0.0, TF)
    assert list(pos) == [True, False, False] and list(neg) == [False, True, False]
    assert list(free) == [False, False, True]


def test_bound_beats_sampled_torques():
    rng = np.random.default_rng(0)
    n, gap = 7, 1.5e-3
    for _ in range(200):
        t0, t1 = rng.uniform(-0.5, 0.5, n), rng.uniform(-0.5, 0.5, n)
        r0, r1 = rng.uniform(0, 0.3, n), rng.uniform(0, 0.3, n)
        w = rng.normal(size=n)
        bound = PL.flip_cost(t0, t1, r0, r1, TF, gap, w).sum()
        hb0 = held_bias(t0, t1, TF, gap)
        for s0, s1 in itertools.product((-1, 0, 1), repeat=2):
            a, b = t0 + s0 * r0, t1 + s1 * r1
            assert abs(w @ (held_bias(a, b, TF, gap) - hb0)) <= bound + 1e-15


def test_bound_beats_uniform_draws_inside_the_band():
    rng = np.random.default_rng(1)
    n, gap = 5, 1.5e-3
    t0, t1 = rng.uniform(-0.4, 0.4, n), rng.uniform(-0.4, 0.4, n)
    r0, r1 = rng.uniform(0, 0.3, n), rng.uniform(0, 0.3, n)
    w = rng.normal(size=n)
    c = PL.flip_cost(t0, t1, r0, r1, TF, gap, w)
    hb0 = held_bias(t0, t1, TF, gap)
    for _ in range(5000):
        a = t0 + rng.uniform(-1, 1, n) * r0
        b = t1 + rng.uniform(-1, 1, n) * r1
        d = np.abs(w * (held_bias(a, b, TF, gap) - hb0))
        assert np.all(d <= c + 1e-15)
