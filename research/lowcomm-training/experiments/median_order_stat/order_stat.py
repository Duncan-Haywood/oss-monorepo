"""Order-statistic account of the median's sign-flip cost (milestone 5f).

Per coordinate, M-1 honest workers send mu + sigma*z and worker 0 sends -10x its
own delta (a fresh draw of the same law). We compute the shift of the coordinatewise
median (and trimmed mean) relative to the same aggregator on M all-honest workers,
for M in {4, 8, 16}, over a sweep of the signal-to-noise ratio mu/sigma.
Pure numpy; no training. Prints the shift, its square, and the ratio to M = 4."""
import numpy as np

N = 2_000_000
rng = np.random.default_rng(0)

def agg(x, kind):
    if kind == "median":
        return np.median(x, axis=0)
    s = np.sort(x, axis=0)
    return s[1:-1].mean(axis=0)

print("snr  M  agg      mean|shift|/sigma  mean shift^2/sigma^2  bias(signed)/sigma")
res = {}
for snr in (0.0, 0.5, 1.0, 2.0):
    for M in (4, 8, 16):
        x = snr + rng.standard_normal((M, N))
        y = x.copy()
        y[0] = -10 * x[0]
        for kind in ("median", "trimmed"):
            d = agg(y, kind) - agg(x, kind)
            res[(snr, M, kind)] = (np.abs(d).mean(), (d**2).mean(), d.mean())
            print(f"{snr:3.1f} {M:2d}  {kind:8s} {np.abs(d).mean():.4f}            {(d**2).mean():.4f}               {d.mean():+.4f}")
print()
print("ratio M=4 -> M=8 and M=8 -> M=16 (median), observed loss-cost ratio 4.6 (0.095/0.0207)")
for snr in (0.0, 0.5, 1.0, 2.0):
    a, b, c = (res[(snr, M, "median")] for M in (4, 8, 16))
    print(f"snr {snr}: |shift| {a[0]/b[0]:.2f} {b[0]/c[0]:.2f}   shift^2 {a[1]/b[1]:.2f} {b[1]/c[1]:.2f}   bias {a[2]/b[2] if b[2] else float('nan'):.2f} {b[2]/c[2] if c[2] else float('nan'):.2f}")
