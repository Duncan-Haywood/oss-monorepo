import importlib.util
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3_identify"))
from civ_seeding import bcdj, complex as cx  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "m25", os.path.join(HERE, "..", "experiments", "m25_scaled", "run.py"))
m25 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m25)


@pytest.fixture(scope="module")
def V():
    return bcdj.load()


def test_data_moments_on_real_data_match_moments_ext(V):
    # on the real take-up the leader masks are the cached ones, so all eight columns agree
    Y = [v.takeup.astype(float)[:, None] for v in V[:5]]
    dm = m25.data_moments(V[:5], Y)
    for g, v in enumerate(V[:5]):
        assert np.allclose(dm[g, 0], cx.moments_ext(v, v.takeup.astype(float)))


def test_safe_sd_guards_zero_columns():
    X = np.array([[1.0, 2.0], [1.0, 4.0]])
    assert np.allclose(m25.safe_sd(X), [1.0, 1.0])


def test_whitening_gives_the_weighted_quadratic_form():
    rng = np.random.default_rng(0)
    A = rng.normal(size=(30, 8))
    W = np.linalg.inv(A.T @ A / 30)
    L = np.linalg.cholesky(W)
    x = rng.normal(size=8)
    assert np.isclose(((x @ L) ** 2).sum(), x @ W @ x)


def test_common_scale_leaves_the_choice_unchanged():
    rng = np.random.default_rng(1)
    D = {s: rng.normal(size=(len(m25.POINTS), 6, 8)) for s in m25.SEEDS}
    a = m25.m3.select(D[0], D[1], m25.COLS)
    b = m25.m3.select(*m25.scaled(D, np.full(8, 3.0)).values(), m25.COLS)
    assert all(a["arg"][f] == b["arg"][f] for f in m25.FAMS)
    assert m25.winner(a, "loo") == m25.winner(b, "loo")


def test_bb_lower_sign():
    rng = np.random.default_rng(2)
    share, ci = m25.bb_lower(-np.ones(10), rng, 200)
    assert share == 1.0 and ci[1] < 0
