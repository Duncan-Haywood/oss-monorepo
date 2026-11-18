"""Milestone 14: the rigid-plastic racking model and the hit patterns it scores."""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import tack as T  # noqa: E402
from buildbot_sheathing.asbuilt import U_JOINT  # noqa: E402


def test_irls_matches_a_direct_minimiser():
    minimize = pytest.importorskip("scipy.optimize").minimize
    xz, fr = R.layout()
    rng = np.random.default_rng(3)
    masks = rng.random((4, 62)) > 0.15
    w, p = R.capacity(masks, xz, fr)
    for m, wi, pi in zip(masks, w, p):
        f = lambda q: R.work(q[None], xz, fr, m[None])[0]  # noqa: E731
        r = minimize(f, pi + 0.01, method="Nelder-Mead", options=dict(xatol=1e-12, fatol=1e-14, maxiter=20000))
        assert wi <= r.fun * (1 + 1e-9)
        assert abs(wi - r.fun) / r.fun < 1e-8


def test_six_inch_spacing_reproduces_the_default_layout():
    a, fa = R.layout()
    b, fb = R.layout_spacing(6)
    assert a.shape == b.shape == (62, 2)
    np.testing.assert_allclose(np.sort(a, axis=0), np.sort(b, axis=0))
    np.testing.assert_allclose(np.sort(fa), np.sort(fb))


def test_single_misses_are_symmetric_and_joint_nails_carry_most():
    xz, fr = R.layout()
    single = np.ones((62, 62), bool)
    np.fill_diagonal(single, False)
    loss = 1 - R.relative(single, xz, fr)
    np.testing.assert_allclose(loss[:17], loss[17:34], atol=1e-9)        # left and right joint edges
    np.testing.assert_allclose(loss[:17], loss[16::-1], atol=1e-9)       # top and bottom
    assert loss[:34].min() > loss[34:48].max()                           # edge nails beat field nails
    assert np.all(loss > 0)


def test_more_misses_never_add_capacity():
    xz, fr = R.layout()
    m = np.ones((3, 62), bool)
    m[1, 3] = False
    m[2, [3, 4]] = False
    r = R.relative(m, xz, fr)
    assert r[0] == 1.0 or abs(r[0] - 1) < 1e-12
    assert r[0] > r[1] > r[2]


def test_hits_count_the_missed_nails_and_u_joint_defaults():
    kw = dict(trials=2000, seed=5, s_read=0.5e-3, s_x=1e-3, s_theta=1e-3)
    a = T.simulate(return_hits=True, **kw)
    b = T.simulate(u_joint=U_JOINT, **kw)
    assert a["hits"].shape == (2000, 62)
    assert abs((~a["hits"]).sum(axis=1).mean() - a["missed"]) < 1e-12
    assert a["clean"] == b["clean"] and a["missed"] == b["missed"]
    c = T.simulate(u_joint=np.linspace(U_JOINT[0], U_JOINT[-1], 25), return_hits=True, **kw)
    assert c["hits"].shape == (2000, 78)
