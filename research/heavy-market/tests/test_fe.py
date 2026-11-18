import numpy as np

from heavy_market.fe import depreciation, drop_singletons, sweep


def synthetic(beta, n=20000, seed=0, noise=0.1):
    rng = np.random.default_rng(seed)
    model = rng.integers(0, 300, n)
    sale = rng.integers(1990, 2012, n)
    age = rng.integers(0, 20, n)
    # model effects correlated with age (old models sell older): a naive pooled slope is biased
    alpha = np.log(20000 + 400 * np.arange(300))
    year = 0.03 * (sale - 1990)
    y = alpha[model] + year + beta * age + rng.normal(0, noise, n)
    return y, age, model, sale


def test_recovers_known_slope():
    beta = np.log(1 - 0.08)
    y, age, model, sale = synthetic(beta)
    out = depreciation(y, age, model, sale)
    assert abs(out["beta"] - beta) < 3 * out["se"] + 1e-3
    assert abs(out["rate"] - 0.08) < 0.005
    assert out["rate_lo"] < 0.08 < out["rate_hi"]


def test_sale_year_trend_does_not_leak_into_age():
    # prices rise 3%/yr with sale year; without the sale-year effect age and sale year are confounded
    rng = np.random.default_rng(1)
    n = 20000
    made = rng.integers(1980, 2005, n)
    sale = made + rng.integers(0, 15, n)
    age = sale - made
    model = rng.integers(0, 200, n)
    y = 10 + 0.05 * (sale - 1980) - 0.10 * age + rng.normal(0, 0.05, n)
    out = depreciation(y, age, model, sale)
    assert abs(out["beta"] + 0.10) < 0.005


def test_sweep_removes_group_means():
    g = np.array([0, 0, 1, 1, 1])
    v = sweep(np.array([1.0, 3.0, 2.0, 4.0, 6.0]), [g])
    assert np.allclose(v, [-1, 1, -2, 0, 2])


def test_drop_singletons():
    assert drop_singletons(np.array([5, 5, 7, 9, 9, 9])).tolist() == [True, True, False, True, True, True]
