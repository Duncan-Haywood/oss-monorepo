"""Milestone 3d: the window-pooling helpers (experiments/m3d_pool/pool.py) on known cases."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3d_pool"))
import pool  # noqa: E402


def test_ivw_equal_sds_is_mean_with_shrunk_sd():
    mu, sd = pool.ivw_pool([1.0, 2.0, 3.0, 4.0], [2.0] * 4)
    assert abs(mu - 2.5) < 1e-12 and abs(sd - 1.0) < 1e-12


def test_dl_no_heterogeneity_matches_ivw():
    f = [10.0, 10.0, 10.0]
    mu, sd, tau2 = pool.dl_pool(f, [1.0, 2.0, 1.0])
    mi, si = pool.ivw_pool(f, [1.0, 2.0, 1.0])
    assert tau2 == 0.0 and abs(mu - mi) < 1e-12 and abs(sd - si) < 1e-12


def test_dl_wide_spread_widens_sd():
    f = [0.0, 10.0, 20.0, 30.0]
    mu, sd, tau2 = pool.dl_pool(f, [1.0] * 4)
    _, si = pool.ivw_pool(f, [1.0] * 4)
    assert tau2 > 100 and sd > 5 * si and abs(mu - 15) < 1e-9


def test_dl_coverage_under_random_effects():
    rng = np.random.default_rng(0)
    z = []
    for _ in range(2000):
        theta = rng.normal(0, 3, 8)
        sd = rng.uniform(0.5, 2, 8)
        f = theta + rng.normal(0, sd)
        mu, s, _ = pool.dl_pool(f, sd)
        z.append(mu / s)
    rmsz = float(np.sqrt(np.mean(np.square(z))))
    assert 0.8 < rmsz < 1.4


def test_blocks_slide_by_one():
    rows = [{"window": i, "f": 500.0 + i, "sd_jk": 5.0, "ref": 500.0} for i in range(7)]
    b = pool.blocks(rows, 5)
    assert [x["start"] for x in b] == [0, 1, 2] and abs(b[0]["med"] - 502.0) < 1e-12
