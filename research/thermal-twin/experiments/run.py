"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from thermal_twin.model import (LAM_C, steady_phi, lam_max, simulate, runaway_time, ghost_time, rhs, current_ratio,
                                tau_overestimate)

print("Thermal twin: phi' = lam/(1-phi)^2 - phi (time in units of Rth*C), phi = alpha*theta, lam = alpha*c*tau^2. Twin: phi = lam.")
print("Fold: phi(1-phi)^2 = lam has a root iff lam <= 4/27 = %.6f at phi = 1/3." % LAM_C)

print("\n== 1. Steady hold: twin vs real (beta = 0) ==")
print("lam     twin phi  real phi  real/twin temp  current ratio 1/(1-phi)  residual |phi(1-phi)^2-lam|  sim phi(t=40)")
for lam in (0.01, 0.03, 0.06, 0.10, 0.13, 0.14, 0.148):
    p = steady_phi(lam)
    ts, ps = simulate(lam, 40.0, dt=2e-3)
    print("%-7g %-9.4f %-9.4f %-15.3f %-24.3f %-27.2e %.4f" % (lam, lam, p, p / lam, current_ratio(p), abs(p * (1 - p) ** 2 - lam), ps[-1]))
print("lam = 4/27 (%.6f): real phi = 1/3 vs twin %.4f (2.25x temperature, 1.5x current)" % (LAM_C, LAM_C))
for lam in (0.15, 0.16, 0.2):
    print("lam = %-5g no steady hold: steady_phi = %s" % (lam, steady_phi(lam)))

print("\n== 2. Runaway time above the fold (beta = 0), time to phi = 0.999 in units of Rth*C ==")
print("lam     eps=lam-4/27  runaway time  ghost 4pi/(9 sqrt eps)  ratio   RK4 time to 0.999 (dt=1e-3)")
for lam in (0.15, 0.16, 0.18, 0.2, 0.3, 0.5, 1.0):
    eps = lam - LAM_C
    T = runaway_time(lam)
    ts, ps = simulate(lam, 200.0, dt=1e-3)
    tsim = ts[-1] if ps[-1] >= 0.999 else float("nan")
    print("%-7g %-13.5f %-13.4f %-21.4f %-7.3f %.4f" % (lam, eps, T, ghost_time(eps), T / ghost_time(eps), tsim))
print("closer to the fold:")
for eps in (1e-2, 1e-3, 1e-4, 1e-5):
    T = runaway_time(LAM_C + eps, n=2000000)
    print("eps = %-7g runaway time %-10.3f ghost %-10.3f ratio %.4f" % (eps, T, ghost_time(eps), T / ghost_time(eps)))

print("\n== 3. How long a test must run to see the twin is wrong (beta = 0): first time real current exceeds twin's by 5%, i.e. phi = 1-1/1.05 ==")
print("lam     t(+5% current)  steady phi  (units of Rth*C)")
for lam in (0.02, 0.05, 0.10, 0.14):
    ts, ps = simulate(lam, 60.0, dt=1e-3)
    target = 1 - 1 / 1.05
    t5 = next((t for t, p in zip(ts, ps) if p >= target), float("nan"))
    print("%-7g %-15.3f %.4f" % (lam, t5, steady_phi(lam)))
print("a test of length 0.1 Rth*C at lam=0.14 sees phi = %.4f (current +%.1f%%)" % (simulate(0.14, 0.1, dt=1e-3)[1][-1], 100 * (current_ratio(simulate(0.14, 0.1, dt=1e-3)[1][-1]) - 1)))

print("\n== 4. Certified load under a winding temperature limit phi_m (beta = 0): twin torque / real torque ==")
print("phi_m   twin tau_max^2 (lam)  real lam_max  tau overestimate")
for pm in (0.05, 0.1, 0.2, 1 / 3, 0.4, 0.6, 0.8):
    real = pm * (1 - pm) ** 2 if pm <= 1 / 3 else LAM_C
    print("%-7.3f %-21.3f %-13.4f %.3f" % (pm, pm, real, tau_overestimate(pm)))
print("illustration: alpha = 0.001/K (magnet-like), theta_max = 100 K -> phi_m = 0.1 -> twin overstates the holdable torque by %.3fx; alpha = 0.004/K -> phi_m = 0.4 -> %.3fx" % (tau_overestimate(0.1), tau_overestimate(0.4)))

print("\n== 5. Fitting the twin's gain on a low-load hot run (beta = 0): constant k_eff = k0 (1 - phi_fit), steady state matched ==")
print("A twin with k_eff predicts phi = lam_twin(k_eff) where lam scales as 1/k_eff^2: phi_pred(lam) = lam/(1-phi_fit)^2 (in the same units, until temperature limit).")
print("fit lam   phi_fit   test lam   real phi   refit-twin phi   error")
for lf in (0.03, 0.06, 0.10):
    pf = steady_phi(lf)
    for lt in (0.10, 0.14):
        pr = steady_phi(lt)
        pp = lt / (1 - pf) ** 2
        print("%-9g %-9.4f %-10g %-10.4f %-16.4f %+.4f" % (lf, pf, lt, pr, pp, pp - pr))
print("(refit twin still has no fold: predicts a hold at every lam; at lam = 0.16 it says phi = %.3f, real has none)" % (0.16 / (1 - steady_phi(0.10)) ** 2))

print("\n== 6. Winding resistance rise (b = beta/alpha) moves the fold ==")
print("b      lam_max     phi at fold   (b = 0: 4/27 = %.6f, 1/3)" % LAM_C)
for b in (0.0, 0.5, 1.0, 1.5, 3.0):
    lm, pf = lam_max(b)
    p = steady_phi(0.9 * lm, b)
    print("%-6g %-11.6f %-13.4f steady phi at 0.9*lam_max = %.4f; runaway time at 1.1*lam_max = %.3f" % (b, lm, pf, p, runaway_time(1.1 * lm, b)))
