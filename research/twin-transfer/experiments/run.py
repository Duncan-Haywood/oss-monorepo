"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from twin_transfer import *

a, b, q, r, s2 = 0.9, 1.0, 1.0, 0.1, 1.0
ks = optimal_gain(a, b, q, r)
print("plant a=%.1f b=%.1f q=%.1f r=%.1f s2=%.1f; optimal gain k*=%.4f, p=%.4f, J*=%.4f, J''(k*)=%.3f, dk*/db=%.4f" % (
    a, b, q, r, s2, ks, riccati_p(a, b, q, r), cost(a, b, ks), cost_curvature(a, b), gain_sensitivity(a, b)))

print("\n== 1. Cost formula vs simulation (400k steps) ==")
for k in (0.4, ks, 1.6):
    print("k=%.3f  exact %.4f  sim %.4f" % (k, cost(a, b, k), simulate_cost(a, b, k, q, r, s2, 400000, 1000, 3)))

print("\n== 2. Twin input-gain error (a known): regret of twin-trained gain on the plant ==")
print("b_hat/b   twin gain   regret      local formula")
for m in (0.15, 0.2, 0.25, 0.3, 0.5, 0.8, 0.9, 0.95, 1.05, 1.1, 1.25, 2.0, 3.0):
    rg = twin_regret(a, b, a, m * b, q, r)
    print("%-8.2f  %.4f     %-10s  %.5f" % (m, twin_gain(a, m * b, q, r), "inf" if math.isinf(rg) else "%.5f" % rg, local_regret(a, b, m * b, q, r)))
print("cliff: twin gain k*(mb) stable on plant iff m > m_c; solve |a - b k*(m b)| < 1")
lo, hi = 0.01, 1.0
for _ in range(60):
    mid = (lo + hi) / 2
    if math.isinf(twin_regret(a, b, a, mid * b, q, r)): lo = mid
    else: hi = mid
print("critical b_hat/b = %.4f" % hi)

print("\n== 3. Validation blind spot: log-score gap of twin (a_hat=a, b_hat=1.4 b) by validation data ==")
ah, bh = a, 1.4 * b
print("twin regret on plant: %.5f" % twin_regret(a, b, ah, bh, q, r))
print("data source                         v     E x^2   E u^2   score gap   gap/regret")
rg = twin_regret(a, b, ah, bh, q, r)
for name, kb, v in (("passive (u=0)", 0.0, 0.0), ("passive + probe", 0.0, 0.05), ("passive + probe", 0.0, 0.5),
                    ("deployed policy, no probe", ks, 0.0), ("deployed policy + probe", ks, 0.05), ("deployed policy + probe", ks, 0.5)):
    exx, euu, _ = stationary_moments(a, b, kb, v, s2)
    g = score_gap(a, b, ah, bh, kb, v, s2)
    print("%-33s %5.2f  %6.3f  %6.3f   %.6f    %.4f" % (name, v, exx, euu, g, g / rg))
print("\nBlind direction at the deployed gain: twin (a_hat, b_hat) with a_hat - a = k (b_hat - b)")
for ah in (0.7, 0.8, 0.85, 0.95):
    bh = blind_direction(a, b, ah, ks)
    print("a_hat=%.2f b_hat=%.4f  closed-loop gap %.2e  probed gap (v=0.2) %.5f  twin gain %.4f (k*=%.4f)  regret %.5f" % (
        ah, bh, score_gap_closed_loop(a, b, ah, bh, ks, s2), score_gap(a, b, ah, bh, ks, 0.2, s2), twin_gain(ah, bh, q, r), ks, twin_regret(a, b, ah, bh, q, r)))

print("\n== 4. Worth of a twin in real transitions: b unknown, twin bias delta, probe variance v ==")
v = 0.5
print("delta   kappa*   n_eff(real steps)   MSE with n=100: kappa=0 / kappa* / 3kappa* / kappa*/3")
for d in (0.05, 0.1, 0.2, 0.4, 0.8):
    ka, S = kappa_star(d, s2), 100 * v
    print("%-6.2f  %-7.1f  %-17.1f   %.5f / %.5f / %.5f / %.5f" % (d, ka, n_eff(d, s2, v), shrink_mse(d, s2, S, 0), shrink_mse(d, s2, S, ka),
                                                            shrink_mse(d, s2, S, 3 * ka), shrink_mse(d, s2, S, ka / 3)))
print("\nMonte Carlo (20000 trials), delta=0.3, n=60, v=0.5:")
d = 0.3
for lab, ka in (("kappa=0", 0.0), ("kappa*", kappa_star(d, s2)), ("3 kappa*", 3 * kappa_star(d, s2)), ("kappa*/3", kappa_star(d, s2) / 3), ("twin only", 1e9)):
    mse, _, bad = simulate_shrinkage(a, b, b + d, ka, 60, v, q, r, s2, 20000, 5)
    print("%-10s MC MSE %.5f  formula %.5f  diverged %.4f" % (lab, mse, shrink_mse(d, s2, 60 * v, ka), bad))
print("\nSamples to reach regret target (regret ~ J''(k*)(dk/db)^2 MSE / 2), delta=0.3, v=0.5:")
c = 0.5 * cost_curvature(a, b) * gain_sensitivity(a, b) ** 2
for rt in (1e-2, 3e-3, 1e-3, 3e-4, 1e-4):
    tm = rt / c
    print("regret %.0e  MSE target %.5f  n (no twin) %.0f  n (twin, kappa*) %.0f  saving %.0f (n_eff=%.0f)" % (
        rt, tm, samples_needed(d, s2, v, tm, kappa=0.0), samples_needed(d, s2, v, tm), samples_needed(d, s2, v, tm, kappa=0.0) - samples_needed(d, s2, v, tm), n_eff(d, s2, v)))

print("\n== 5. Regret vs MSE convergence (delta=0.1, kappa*, v=0.5, 6000 trials): MC regret / local formula ==")
d = 0.1
for n in (100, 400, 1600, 6400):
    mse, reg, bad = simulate_shrinkage(a, b, b + d, kappa_star(d, s2), n, 0.5, q, r, s2, 6000, 6)
    print("n=%-5d MSE %.6f  regret %.6f  ratio %.3f  diverged %.4f" % (n, mse, reg, reg / (c * mse), bad))
print("small-sample divergence risk, delta=0.3, kappa=0 (no twin), b_hat<=0.02 or unstable counted:")
for n in (10, 20, 40, 80):
    mse, reg, bad = simulate_shrinkage(a, b, b + 0.0, 0.0, n, 0.5, q, r, s2, 20000, 9)
    mse2, reg2, bad2 = simulate_shrinkage(a, b, b + 0.3, kappa_star(0.3, s2), n, 0.5, q, r, s2, 20000, 9)
    print("n=%-3d  no twin: diverged %.4f mean regret %.4f | twin: diverged %.4f mean regret %.4f" % (n, bad, reg, bad2, reg2))
