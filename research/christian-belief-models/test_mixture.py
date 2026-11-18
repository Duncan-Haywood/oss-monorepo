"""Checks of the DPMPM sampler (src/dpmpm.py) and the mixture driver's coding, on synthetic data."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'src'))
from dpmpm import DPMPM  # noqa: E402

_sp = importlib.util.spec_from_file_location('m3_mixture', HERE / 'experiments' / 'm3_mixture' / 'run.py')
mix = importlib.util.module_from_spec(_sp); sys.modules['m3_mixture'] = mix; _sp.loader.exec_module(mix)


def two_class_data(n=3000, seed=0):
    """Two latent classes, 6 binary variables: class 0 says 1 w.p. 0.9 on every variable, class 1
    w.p. 0.1. Variables are dependent marginally but independent within class."""
    rng = np.random.default_rng(seed)
    c = rng.random(n) < 0.3
    p = np.where(c, 0.9, 0.1)[:, None]
    return (rng.random((n, 6)) < p).astype(np.int64), c


def test_pi_is_a_distribution_and_shapes():
    X, _ = two_class_data(500)
    m = DPMPM(X, [2] * 6, K=10, seed=1)
    for _ in range(20):
        m.step()
    assert m.pi.sum() == pytest.approx(1.0)
    assert (m.pi > 0).all()
    assert all(p.shape == (10, 2) for p in m.phi)
    assert 1 <= m.occupied() <= 10


def test_rejects_codes_out_of_range():
    with pytest.raises(ValueError):
        DPMPM(np.array([[0, 2]]), [2, 2])


def test_imputes_a_missing_variable_from_the_others():
    """Hide variable 5 for 1000 rows; the conditional share P(x5 = 1 | x0..x4) is known in closed form.
    The mixture must recover it far better than the marginal (which ignores the row's other answers)."""
    X, c = two_class_data(3000, seed=2)
    truth = X[:1000, 5].copy()
    Xm = X.copy(); Xm[:1000, 5] = -1
    m = DPMPM(Xm, [2] * 6, K=10, seed=3)
    for _ in range(200):
        m.step()
    rows = np.arange(1000)
    pr = np.mean([m.step().posterior_prob(rows, 5)[:, 1] for _ in range(20)], axis=0)
    # Exact conditional under the generating model.
    k = X[:1000, :5].sum(1)
    l1 = 0.3 * 0.9 ** k * 0.1 ** (5 - k)
    l0 = 0.7 * 0.1 ** k * 0.9 ** (5 - k)
    post = l1 / (l1 + l0)
    exact = post * 0.9 + (1 - post) * 0.1
    assert np.abs(pr - exact).mean() < 0.03
    # Overall imputed share matches the hidden rows' share.
    draws = np.mean([m.step().impute(rows, 5).mean() for _ in range(20)])
    assert draws == pytest.approx(truth.mean(), abs=0.03)


def test_missing_cells_do_not_change_the_class_likelihood():
    X = np.array([[0, 1], [1, -1]])
    m = DPMPM(X, [2, 2], K=3, seed=0)
    ll = m._loglik()
    assert ll[1] == pytest.approx(np.log(m.phi[0][:, 1]))


def test_code_bins_and_keeps_missing():
    df = pd.DataFrame({'age': [18, 35, np.nan, 85], 'race': [1, 2, 3, np.nan], 'female': [1, 1, 1, 1],
                       'log_realinc': [8., 9., 10., np.nan]})
    X, L = mix.code(df, ['age', 'race', 'female', 'log_realinc'])
    assert list(L) == [6, 3, 5]  # `female` has one level and is dropped
    assert list(X[:, 0]) == [0, 1, -1, 5]
    assert list(X[:, 1]) == [0, 1, 2, -1]
    assert X[3, 2] == -1


def test_rubin_matches_mice():
    Q, se, sb = mix.rubin([0.4, 0.5, 0.6], [0.01, 0.01, 0.01])
    assert Q == pytest.approx(0.5)
    assert se ** 2 == pytest.approx(0.01 + (1 + 1 / 3) * 0.01)
