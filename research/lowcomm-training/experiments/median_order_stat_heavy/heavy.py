"""Milestone 5g: does 5f's order-statistic account survive heavy-tailed coordinates? Same
design as ../median_order_stat/order_stat.py, but the honest workers' noise is Student-t with
nu degrees of freedom, rescaled to unit variance (nu = inf is the Gaussian of 5f). Worker 0
sends -10x a fresh draw of its own delta. Pure numpy; no training.
Usage: python3 heavy.py > heavy_results.txt"""
import numpy as np

N = 2_000_000
rng = np.random.default_rng(0)


def noise(nu, shape):
    z = rng.standard_normal(shape) if nu == np.inf else rng.standard_t(nu, shape) / np.sqrt(nu / (nu - 2))
    return z


def agg(x, kind):
    if kind == "median":
        return np.median(x, axis=0)
    return np.sort(x, axis=0)[1:-1].mean(axis=0)


print("nu    snr  M  agg      mean shift^2/sigma^2   ratio M=4 -> 8   ratio M=8 -> 16")
for nu in (np.inf, 5, 3):
    for snr in (0.0, 1.0):
        sq = {}
        for M in (4, 8, 16):
            x = snr + noise(nu, (M, N))
            y = x.copy()
            y[0] = -10 * x[0]
            for kind in ("median", "trimmed"):
                sq[(M, kind)] = ((agg(y, kind) - agg(x, kind)) ** 2).mean()
        for kind in ("median", "trimmed"):
            print(f"{nu:<5} {snr:3.1f}  -  {kind:8s} M4 {sq[(4, kind)]:.4f} M8 {sq[(8, kind)]:.4f} M16 {sq[(16, kind)]:.4f}"
                  f"     {sq[(4, kind)] / sq[(8, kind)]:.2f}             {sq[(8, kind)] / sq[(16, kind)]:.2f}")
