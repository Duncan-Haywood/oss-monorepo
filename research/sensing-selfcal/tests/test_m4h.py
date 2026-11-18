"""Milestone 4h's model reference matches milestone 4g's statistic and is calibrated where the model holds."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location("m4h", os.path.join(HERE, "..", "experiments", "m4h_modelref", "analyse.py"))
m4h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4h)


def test_vectorised_variances_match_m4g():
    rng = np.random.default_rng(3)
    e = rng.standard_normal((50, 7))
    f, J, R = m4h.set_variances(e)
    for i in range(50):
        loo = [(e[i].sum() - x) / 6 for x in e[i]]
        j, r = m4h.m4g.variances(loo)
        assert np.isclose(J[i], j) and np.isclose(R[i], r) and np.isclose(f[i], e[i].mean())


def test_plain_jackknife_reference_is_near_welch_t():
    # J of a mean is s^2/n exactly, so z_J is a Welch t; its 99th pct (squared) for 7 + 6 views lies near F(1, ~10)
    zJ, _ = m4h.model_z2(7, 6, n_draws=200_000, seed=1)
    q = np.quantile(zJ, 0.99)
    assert 9.0 < q < 11.0


def test_model_reference_is_calibrated_on_independent_draws():
    _, zR = m4h.model_z2(7, 6, n_draws=200_000, seed=1)
    q = np.quantile(zR, 0.99)
    _, zR2 = m4h.model_z2(7, 6, n_draws=200_000, seed=2)
    assert 0.008 < np.mean(zR2 > q) < 0.012
    assert np.mean(zR2 > m4h.CHI2) > 0.03      # chi^2_1 is lenient for R under the model


def test_scale_free():
    rng_a, rng_b = np.random.default_rng(5), np.random.default_rng(5)
    a = m4h.set_variances(rng_a.standard_normal((10, 6)))
    b = m4h.set_variances(3.0 * rng_b.standard_normal((10, 6)))
    assert np.allclose(b[1], 9 * a[1]) and np.allclose(b[2], 9 * a[2])
