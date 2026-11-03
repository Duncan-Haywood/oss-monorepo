import os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import baselines  # noqa: E402


def _frame(n=400, seed=0):
    r = np.random.default_rng(seed)
    return pd.DataFrame({"log_cost": np.where(r.random(n) < .2, np.nan, r.normal(10, 1, n)),
                         "desc_len": r.integers(0, 100, n).astype(float), "month": r.integers(1, 13, n),
                         "dow": r.integers(0, 5, n), "permit_type": pd.Categorical(r.choice(list("ab"), n)),
                         "work_class": pd.Categorical(r.choice(list("cd"), n)),
                         "area": pd.Categorical(r.choice(list("ef"), n))})


def test_design_has_no_nan_and_same_columns():
    a, b = _frame(400, 0), _frame(50, 1)
    A, B = baselines.design(a, [b])
    assert A.shape[1] == B.shape[1] and not np.isnan(A).any() and not np.isnan(B).any()


def test_linear_quantiles_are_ordered_on_a_constant_target():
    a = _frame(300)
    A, = baselines.design(a, [])
    y = np.full(300, 7.0)
    q = baselines.lin_fit_predict(A, y, A, 300, 0)
    assert all(abs(q[t] - 7.0).max() < 1e-6 for t in q)
