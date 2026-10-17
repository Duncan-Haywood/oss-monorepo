"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from timestep_twin import *

K = 1.0
print("Closed loop x'' = -k(x-1) - c x', k=1 (time in 1/omega0), c=2*zeta.  Real: exact flow.  Twin: one fixed-step integrator of step h.")
print("explicit = forward Euler; semi-implicit = velocity first, then position with the new velocity; implicit = backward Euler.")

print("\n== 1. Per-step squared modulus rho^2 of the closed-loop eigenvalues (complex pair) ==")
print("closed forms: real e^{-hc}; explicit 1-hc+h^2k; semi-implicit 1-hc; implicit 1/(1+hc+h^2k).  max |closed form - det(step matrix)| over the grid below:")
worst = 0.0
for m in METHODS:
    for h in (0.05, 0.1, 0.2, 0.4):
        for z in (0.2, 0.4, 0.6):
            c = 2 * z
            M = step_matrix(m, h, K, c)
            worst = max(worst, abs(M[0][0] * M[1][1] - M[0][1] * M[1][0] - rho2_exact(m, h, K, c)))
print("  %.2e" % worst)
print("zeta  h     real     explicit semi-imp implicit | equivalent decay sigma_T / sigma (exact; first-order in brackets)")
for z in (0.3, 0.6, 0.8):
    c = 2 * z
    for h in (0.1, 0.4):
        row = "%-5g %-5g %.4f   " % (z, h, rho2_real(h, c)) + "  ".join("%.4f  " % rho2_exact(m, h, K, c) for m in METHODS[:3])
        row += "|  " + "  ".join("%s %.3f [%.3f]" % (m[:4], equiv_sigma(m, h, K, c) / z, sigma_first_order(m, h, K, c) / z) for m in METHODS)
        print(row)
print("Explicit twin diverges iff c < hk: h=0.5, c=0.4 (real zeta 0.2, stable): spectral radius %.4f" % spectral_radius("explicit", 0.5, K, 0.4))

print("\n== 2. Damping bias sigma_T - sigma at h=0.1 (exact) and the zeta where it changes sign ==")
print("zeta     explicit   semi-imp   implicit")
for z in (0.3, 0.5, 0.6, 0.7, 0.8, 0.9):
    print("%-8g %+.5f   %+.5f   %+.5f" % ((z,) + tuple(equiv_sigma(m, 0.1, K, 2 * z) - z for m in METHODS)))
for m in ("explicit", "implicit"):
    for h in (0.2, 0.1, 0.05, 0.025):
        lo, hi = 0.4, 0.95
        f = lambda z: equiv_sigma(m, h, K, 2 * z) - z
        for _ in range(60):
            mid = (lo + hi) / 2
            if (f(lo) > 0) == (f(mid) > 0):
                lo = mid
            else:
                hi = mid
        print("  sign change for %-8s h=%-6g at zeta=%.4f  (1/sqrt2 = %.4f)" % (m, h, lo, 1 / math.sqrt(2)))

print("\n== 3. Tuned in the twin for overshoot <= target, then run on the real plant (exact) ==")
print("closed-form real overshoot vs RK4 (dt=1e-3): " + "; ".join("c=%.2f %.5f vs %.5f" % (c, real_overshoot(K, c), real_rk4_overshoot(K, c)) for c in (0.4, 1.0, 1.6)))
print("target  method         " + "".join("h=%-18g" % h for h in (0.05, 0.1, 0.2, 0.4)) + "  (cells: tuned c -> real overshoot [ratio to claim])")
for t in (0.01, 0.05, 0.10, 0.20):
    for m in METHODS:
        cells = []
        for h in (0.05, 0.1, 0.2, 0.4):
            c = tune_c(m, h, K, t)
            cells.append("n/a" if c is None else "%.3f->%.4f [%.2f]" % (c, real_overshoot(K, c), real_overshoot(K, c) / t))
        print("%-7g %-14s %s" % (t, m, "  ".join("%-20s" % s for s in cells)))

print("\n== 4. Convergence: real overshoot at the twin-tuned c, target 10%, excess over the claim vs h ==")
print("method         " + "  ".join("h=%-8g" % h for h in (0.4, 0.2, 0.1, 0.05, 0.025, 0.0125)) + "   excess ratios between successive halvings")
for m in METHODS:
    ex = []
    for h in (0.4, 0.2, 0.1, 0.05, 0.025, 0.0125):
        c = tune_c(m, h, K, 0.10)
        ex.append(None if c is None else real_overshoot(K, c) - 0.10)
    ratios = ["%.2f" % (ex[i] / ex[i + 1]) for i in range(len(ex) - 1) if ex[i] is not None and ex[i + 1] is not None and ex[i + 1] != 0]
    print("%-14s %s   %s" % (m, "  ".join("%+.4f  " % e if e is not None else "n/a      " for e in ex), " ".join(ratios)))

print("\n== 5. Repairs at h=0.2, target 10%, semi-implicit and implicit ==")
for m in ("semi-implicit", "implicit"):
    h = 0.2
    c = tune_c(m, h, K, 0.10)
    real = real_overshoot(K, c)
    print("%s: tuned c=%.4f, twin claims 0.1000, real %.4f" % (m, c, real))
    print("  (a) verify the candidate at finer steps (overshoot predicted for the SAME c):  " + "  ".join("h/%d: %.4f" % (n, twin_overshoot(m, h / n, K, c)) for n in (1, 2, 4, 8, 16, 64)))
    print("  (b) Richardson 2*o(h/2)-o(h) at h, h/2, h/4: " + "  ".join("%.4f" % richardson_overshoot(m, h / n, K, c) for n in (1, 2, 4)) + "   (real %.4f)" % real)
    for tol in (0.01, 0.002):
        for n in (1, 2, 4, 8, 16, 32, 64, 128):
            c2 = tune_c(m, h / n, K, 0.10)
            if abs(real_overshoot(K, c2) - 0.10) <= tol:
                print("  (c) retune with h/n substeps until |real - 0.10| <= %g: n=%d (c=%.4f, real %.4f; twin cost x%d)" % (tol, n, c2, real_overshoot(K, c2), n))
                break
