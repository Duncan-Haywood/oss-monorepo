"""Fano factor of false-wake counts per window: correlation, noise-scale drift and lockout. Prints results.txt."""
import numpy as np
from ambient_wakeburst import simulate_counts, fano, fano_ci

W = 100_000          # frames per window (1,000 s of 10 ms frames)
N = 2000             # windows per cell (200 million frames)
PHI = 0.9
TARGET = 50.0        # mean wakes per window the threshold is calibrated to (no drift, no lockout)


def calibrate(phi, m, target=TARGET):
    """Threshold whose pilot mean count per window is closest to target (bisection on 100 pilot windows, seed 5)."""
    lo, hi = -1.0, 6.0
    for _ in range(14):
        mid = 0.5 * (lo + hi)
        if simulate_counts(mid, phi, m, W, 100, 5).mean() > target:
            lo = mid
        else:
            hi = mid
    return round(0.5 * (lo + hi), 3)


def row(label, c):
    lo, hi = fano_ci(c)
    return f"{label}  mean {c.mean():8.2f}  var {c.var(ddof=1):8.2f}  fano {fano(c):5.3f}  [{lo:5.3f}, {hi:5.3f}]"


TH = {(PHI, m): calibrate(PHI, m) for m in (1, 3, 5)}
for phi in (0.5, 0.95):
    TH[(phi, 3)] = calibrate(phi, 3)

print(f"== A. Stationary scores, no lockout: Fano factor of wake counts per window ({W:,} frames; {N} windows; calibrated to ~{TARGET:.0f} wakes a window)")
print("   phi  m  theta  stats")
for (phi, m), th in sorted(TH.items()):
    c = simulate_counts(th, phi, m, W, N, seed=100 + m)
    print(f"  {phi:4.2f} {m:2d} {th:6.3f}  " + row("", c))

print()
print("== B. Noise-scale drift between windows (scores multiplied by exp(sigma*z) per window), phi=0.9, thresholds from A")
print("   m  sigma  stats")
FB = {}
for m in (1, 3, 5):
    for sg in (0.0, 0.02, 0.05, 0.1):
        c = simulate_counts(TH[(PHI, m)], PHI, m, W, N, seed=200 + m, scale_sigma=sg)
        FB[(m, sg)] = fano(c)
        print(f"  {m:2d} {sg:5.2f}  " + row("", c))

print()
print("== C. Lockout of L frames after a kept wake, m=3, phi=0.9, theta from A")
print("   sigma    L  stats")
for sg in (0.0, 0.05):
    for L in (0, 10, 50, 200, 1000):
        c = simulate_counts(TH[(PHI, 3)], PHI, 3, W, N, seed=300, scale_sigma=sg, L=L)
        print(f"  {sg:5.2f} {L:4d}  " + row("", c))

print()
print("== D. Does the window length matter? m=3, phi=0.9, theta from A, sigma=0.05 (drift per 100,000-frame window); sums of k consecutive windows")
print("   k  window_frames  stats")
c0 = simulate_counts(TH[(PHI, 3)], PHI, 3, W, N, seed=400, scale_sigma=0.05)
for k in (1, 4, 16):
    ck = c0[: N // k * k].reshape(-1, k).sum(axis=1)
    print(f"  {k:2d} {k * W:13,d}  " + row("", ck))

print()
print("== E. Fano factor against drift sigma (from B)")
print("  sigma  m=1  m=3  m=5")
for sg in (0.0, 0.02, 0.05, 0.1):
    print(f"  {sg:5.2f}  {FB[(1, sg)]:6.2f}  {FB[(3, sg)]:6.2f}  {FB[(5, sg)]:6.2f}")
