import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m6c_quantile"))
import numpy as np
from quantile import load, quantile_bound, upper_quantile


def test_lemma_holds_on_random_laws():
    rng = np.random.default_rng(0)
    for _ in range(200):
        t = rng.random(500)
        r = np.clip(t + rng.normal(0, rng.random() * 0.4, 500), 0, 1)
        ad = np.abs(r - t)
        for q in (0.01, 0.05, 0.1):
            assert r.mean() >= quantile_bound(t.mean(), upper_quantile(ad, q), q) - 1e-12


def test_tight_law_attains_bound():
    q, d = 0.1, 0.3
    t = np.ones(1000)
    r = np.concatenate([np.full(900, 1 - d), np.zeros(100)])
    assert abs(r.mean() - quantile_bound(t.mean(), upper_quantile(np.abs(r - t), q), q)) < 1e-9


def test_pools_valid():
    names, a = load()
    t = a[:, 0]
    for j in range(1, a.shape[1]):
        r = a[:, j]
        assert r.mean() >= t.mean() - np.abs(r - t).mean() - 1e-12
