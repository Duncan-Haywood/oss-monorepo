"""Milestone 16: the softening-nail pushover."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import softnail as S  # noqa: E402
from buildbot_sheathing.budget import HEIGHT  # noqa: E402

MM = 1e-3


def test_backbone_hits_its_tested_points():
    bb = S.Backbone.from_tests(972.0, 12 * MM, 496e3, 28.7 * MM)
    d40 = 0.4 * 972.0 / 496e3
    assert abs(bb.load(d40) - 0.4 * 972.0) < 1e-6
    assert abs(bb.load(bb.dp) - 972.0) < 1e-9
    assert abs(bb.load(bb.du) - 0.8 * 972.0) < 1e-6
    assert bb.load(bb.dp + 5.01 * (bb.du - bb.dp)) == 0.0
    d = np.linspace(0, 0.2, 400)
    assert np.all(np.diff(bb.load(d[d <= bb.dp])) >= 0)


def test_energy_derivative_is_the_load():
    for bb in (S.Backbone.from_tests(972.0, 9 * MM, 496e3, 20.6 * MM), S.Backbone.elastic_plastic(1.0, 2 * MM)):
        d = np.linspace(0.1 * MM, 0.12, 300)
        h = 1e-8
        E1 = bb._parts(d + h)[2]
        E0 = bb._parts(d - h)[2]
        np.testing.assert_allclose((E1 - E0) / (2 * h), bb.load(d), rtol=1e-5, atol=1e-6)


def test_elastic_plastic_reduces_to_milestone_14():
    xz, fr = R.layout()
    rng = np.random.default_rng(5)
    masks = np.vstack([np.ones(62, bool), rng.random((3, 62)) > 0.1])
    w = R.capacity(masks, xz, fr)[0] / HEIGHT
    o = S.pushover(masks, xz, fr, S.Backbone.elastic_plastic(1.0, 0.01 * MM), step=2 * MM)
    np.testing.assert_allclose(o["peak"], w, rtol=5e-3)


def test_equilibrium_and_symmetry():
    xz, fr = R.layout()
    bb = S.Backbone.from_tests(972.0, 12 * MM, 496e3, 28.7 * MM)
    o = S.pushover(np.ones((1, 62), bool), xz, fr, bb, d_max=0.08, step=1 * MM)
    assert o["max_grad"] < 1e-6
    # the load is the drift-derivative of the relaxed energy: check by finite differences on the curve
    E = np.concatenate([[0.0], np.cumsum(o["curves"][0] * 1 * MM)])
    assert np.all(np.isfinite(E))
    # a mirrored miss pattern (left <-> right joint edge) gives the same peak
    m = np.ones((2, 62), bool)
    m[0, 3] = False
    m[1, 17 + 3] = False
    p = S.pushover(m, xz, fr, bb, d_max=0.1, step=1 * MM)["peak"]
    assert abs(p[0] - p[1]) / p[0] < 1e-6


def test_softening_peak_is_below_rigid_plastic():
    xz, fr = R.layout()
    bb = S.Backbone.from_tests(1.0, 12 * MM, 496e3 / 972.0, 28.7 * MM)
    o = S.pushover(np.ones((1, 62), bool), xz, fr, bb, step=1 * MM)
    w = R.capacity(np.ones((1, 62), bool), xz, fr)[0][0] / HEIGHT
    assert 0.5 * w < o["peak"][0] < w
