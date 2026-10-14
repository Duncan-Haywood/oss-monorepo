"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from coupling_twin.model import (spectral_radius, stable_gain_limit, simulate, steps_to_tol, real_rate_twin_fit,
                                 mc_fit, fitted_diag_gain)

print("Coupling twin: two axes, x+ = x - k G x, G = [[1,c12],[c21,1]]; the twin models each axis alone (G = I).")

print("\n== 1. Stable-gain limit: twin says 2; real is 2/(1+sqrt(p)) (p = c12 c21 >= 0) or 2/(1+|p|) (p < 0) ==")
print("c12    c21     limit    check: rho(limit-0.01)  rho(limit+0.01)")
for c12, c21 in ((0.0, 0.0), (0.1, 0.1), (0.25, 0.25), (0.5, 0.5), (0.9, 0.9), (0.5, -0.5), (1.0, -1.0), (2.0, -2.0), (1.2, 1.2)):
    L = stable_gain_limit(c12, c21)
    chk = "%.4f  %.4f" % (spectral_radius(L - 0.01, c12, c21), spectral_radius(L + 0.01, c12, c21)) if L else "no stable k>0: rho(0.01)=%.4f" % spectral_radius(0.01, c12, c21)
    print("%-6g %-7g %-8.4f %s" % (c12, c21, L, chk))

print("\n== 2. A twin-certified 10% margin (k = 1.8) fails once coupling exceeds 1/9 ==")
for c in (0.05, 0.11, 0.12, 0.2):
    print("c = %-5g twin rho %.3f  real rho %.4f  %s" % (c, spectral_radius(1.8, 0, 0), spectral_radius(1.8, c, c),
                                                          "stable" if spectral_radius(1.8, c, c) < 1 else "UNSTABLE"))

print("\n== 3. Twin-deadbeat gain k = 1: twin settles in 1 step; real rate is |c| (= sqrt|p|) ==")
print("c      real rho   steps to 1e-6   simulated |x_t| at that step (x0=(1,0.3))")
for c in (0.1, 0.4, 0.8, 0.95):
    n = steps_to_tol(c, 1e-6)
    xs = simulate(1.0, c, c, (1.0, 0.3), n + 1)
    print("%-6g %-10.4f %-15d %.2e" % (c, spectral_radius(1.0, c, c), n, xs[n]))
print("antisymmetric c12 = -c21 = 0.5: rho(k=1) =", round(spectral_radius(1.0, 0.5, -0.5), 4), "; c = 1.5:", round(spectral_radius(1.0, 1.5, -1.5), 4), "(diverges)")

print("\n== 4. Fitted diagonal gain from logs with input correlation rho (c = 0.3, n = 200, noise 0.5, 2000 log sets) ==")
print("corr  b_hat theory  b_hat MC   var_diag MC  theory   c_hat(full) MC  var_full MC  theory    real rho (k=1/b_hat) theory  formula")
c, n, s = 0.3, 200, 0.5
for corr in (0.0, 0.3, 0.6, 0.8, 0.95, 0.99):
    m, vd, cm, vf = mc_fit(n, c, corr, s, 2000, seed=1)
    vd_th = (s * s + c * c * (1 - corr ** 2)) / n
    vf_th = s * s / (n * (1 - corr ** 2))
    rr = real_rate_twin_fit(c, corr)
    print("%-5g %-13.4f %-10.4f %-12.2e %-8.2e %-15.4f %-12.2e %-9.2e %-28.4f %.4f" % (
        corr, fitted_diag_gain(c, corr), m, vd, vd_th, cm, vf, vf_th, rr, c * (1 + corr) / (1 + c * corr)))
print("rho(corr) = c(1+corr)/(1+c corr) for corr >= 0; corr = -0.6:", round(real_rate_twin_fit(c, -0.6), 4), "; corr = 1:", round(real_rate_twin_fit(c, 1.0), 4))
