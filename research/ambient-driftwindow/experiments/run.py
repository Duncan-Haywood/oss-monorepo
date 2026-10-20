"""Fano factor of false-wake counts against window length under persistent noise-scale drift. Prints results.txt."""
import math
import numpy as np
from ambient_driftwindow import (block_counts, rate_curve, log_rate_fit, drift_path, cox_counts, window_sums,
                                 fano, fano_ci, fano_theory, framelevel_window_counts)

PHI, M, BLOCK = 0.9, 3, 10_000            # AR(1) score correlation, frames in a row, frames per block (100 s of 10 ms)
GRID = np.linspace(-0.45, 0.45, 19)       # log-scale grid for the rate curve; drift beyond it is clipped (4.5 sigma at 0.1)
KS = (1, 4, 16, 64, 256, 1024)            # blocks per window
NB = 2_000_000                            # Cox-level blocks per cell


def calibrate(target, lo=-1.0, hi=6.5):
    """Threshold whose mean wakes per block at scale 1 is closest to target (bisection, 300-block pilot, seed 5)."""
    for _ in range(14):
        mid = 0.5 * (lo + hi)
        rng = np.random.default_rng(5)
        mean = block_counts(mid, PHI, M, BLOCK, np.ones(300), rng).mean()
        lo, hi = (mid, hi) if mean > target else (lo, mid)
    return round(0.5 * (lo + hi), 3)


REG = {}
for name, target, per in (("busy", 5.0, 10_000), ("rare", 0.2, 10_000)):
    th = calibrate(target)
    r = rate_curve(th, PHI, M, BLOCK, GRID, per, seed=11)
    REG[name] = (th, r, log_rate_fit(GRID, r))

print(f"== A. Rate curve: mean wakes per {BLOCK:,}-frame block against log-scale x (scores x exp(x)); m={M}, phi={PHI}; 10,000 blocks per point")
for name, (th, r, f) in REG.items():
    print(f"  regime {name}: theta {th}")
    print("   x      rate   fit    ratio")
    for x, v in zip(GRID[::3], r[::3]):
        print(f"  {x:5.2f} {v:8.4f} {f(x):8.4f} {v / f(x):6.3f}")
    # relative sd of the rate under N(0, sigma^2) log-scale, from the fit
    for sg in (0.02, 0.05, 0.1):
        z = np.random.default_rng(1).standard_normal(400_000) * sg
        rr = f(z)
        print(f"  sigma {sg:4.2f}: mean rate {rr.mean():8.4f}  cv {rr.std() / rr.mean():6.3f}")

print()
print("== B. Fano factor of wake counts per window of K blocks (Cox model: Poisson given drifting scale); tau = drift correlation time in blocks (0 = i.i.d.)")
print("   regime  sigma  tau   K  window_h   mean_per_window  fano  [ci]  theory")
CV = {}
FB = {}
for name, (th, r, f) in REG.items():
    for sg in (0.02, 0.05, 0.1):
        z = np.random.default_rng(1).standard_normal(400_000) * sg
        rr = f(z)
        lam, cv = rr.mean(), rr.std() / rr.mean()
        for tau in (0, 10, 100, 1000):
            rho = math.exp(-1.0 / tau) if tau > 0 else 0.0
            c = cox_counts(f, sg, tau, NB, np.random.default_rng(1000 + tau))
            for k in KS:
                w = window_sums(c, k)
                lo, hi = fano_ci(w, reps=300)
                th_f = fano_theory(lam, cv, rho, k)
                FB[(name, sg, tau, k)] = fano(w)
                print(f"  {name:5s} {sg:5.2f} {tau:5d} {k:5d} {k * BLOCK / 100 / 3600:8.2f} {w.mean():12.2f}  {fano(w):7.2f} [{lo:7.2f}, {hi:7.2f}]  {th_f:7.2f}")

print()
print("== C. Check of the Poisson-given-scale assumption: frame-level model vs Cox model, busy regime, sigma=0.05, tau=100 blocks")
print("   K  windows  model  mean_per_window  fano  [ci]")
th, r, f = REG["busy"]
for k, nw in ((4, 1500), (64, 400)):
    cf = framelevel_window_counts(th, PHI, M, BLOCK, k, nw, 0.05, 100, seed=77)
    cc = window_sums(cox_counts(f, 0.05, 100, nw * k, np.random.default_rng(78)), k)
    for lab, c in (("frame", cf), ("cox", cc)):
        lo, hi = fano_ci(c, reps=300)
        print(f"  {k:3d} {nw:6d}  {lab:5s} {c.mean():10.2f}  {fano(c):7.2f} [{lo:7.2f}, {hi:7.2f}]")

print()
print("== D. Fano factor against window length, busy regime, sigma=0.05 (from B)")
print("  K     iid  tau=10  tau=100  tau=1000")
for k in KS:
    print(f"  {k:4d} " + " ".join(f"{FB[('busy', 0.05, t, k)]:7.2f}" for t in (0, 10, 100, 1000)))
