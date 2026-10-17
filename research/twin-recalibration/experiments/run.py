"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from twin_recalibration import *

a, b, q, r, ve = 0.9, 1.0, 1.0, 0.1, 1.0
k = optimal_gain(a, b)
J = cost(a, b, k)
rho, c = regret_coef(a, b), exp_step_cost(a, b, ve)
print("plant a=%.1f, b=%.1f, q=%.1f, r=%.1f, s2=1; k*=%.4f, clairvoyant cost J*=%.4f; certainty-equivalent gain is stable iff b_hat > %.4f; true-b drift stable below %.3f"
      % (a, b, q, r, k, J, cliff_estimate(a, b), (1 + a) / k))
print("regret coefficient rho = J_kk (dk*/db)^2/2 = %.4f;  experiment step (Rademacher u, ve=%.1f): c = c0 + gamma ve, c0=%.4f, gamma=%.4f, c=%.4f per step"
      % (rho, ve, q / (1 - a * a) - J, q * b * b / (1 - a * a) + r, c))

print("\n== 1. Closed-form schedule vs integer optimisation (idealised = linear experiment cost c*N, no drift inside the window) ==")
print("qd       T* (formula)  N*      excess (formula)  |  idealised discrete: N  T=N+L  excess   |  full model: N  T  excess   closed-form schedule in full model")
for qd in (1e-6, 1e-5, 1e-4, 1e-3):
    cf = closed_form(a, b, qd, ve)
    Ni, Li, ei = best_schedule(a, b, qd, ve, exact_cost=False, drift_in_window=False)
    Nf, Lf, ef = best_schedule(a, b, qd, ve)
    Nc, Tc = max(round(cf['N']), 2), round(cf['T'])
    print("%.0e   %9.0f   %6.2f   %.5f           |   %3d %8d  %.5f           |  %3d %8d  %.5f   %.5f" % (qd, cf['T'], cf['N'], cf['excess'], Ni, Ni + Li, ei, Nf, Nf + Lf, ef,
          cycle_excess(a, b, qd, Nc, Tc - Nc, ve)))

print("\n== 2. Equal thirds: at the optimum, downtime cost = estimation-noise regret = drift regret = A/sqrt(T*) (idealised model) ==")
print("qd       downtime N c/T    noise rho s2/(N ve)    drift rho qd T/2     A/sqrt(T)")
for qd in (1e-6, 1e-4, 1e-3):
    cf = closed_form(a, b, qd, ve)
    T, N = cf['T'], cf['N']
    print("%.0e   %.5f           %.5f                %.5f              %.5f" % (qd, N * c / T, rho / (N * ve), rho * qd * T / 2, cf['third']))

print("\n== 3. Scaling laws from the integer optimiser: slopes of log(quantity) vs log(parameter) ==")
def slope(xs, ys):
    lx, ly = [math.log(x) for x in xs], [math.log(y) for y in ys]
    mx, my = sum(lx) / len(lx), sum(ly) / len(ly)
    return sum((u - mx) * (v - my) for u, v in zip(lx, ly)) / sum((u - mx) ** 2 for u in lx)
qds = [1e-7, 1e-6, 1e-5, 1e-4]
res = [best_schedule(a, b, x, ve, exact_cost=False, drift_in_window=False) for x in qds]
print("drift qd 1e-7..1e-4: slope of T* = %.3f (law -2/3), slope of excess = %.3f (law 1/3), slope of N* = %.3f (law -1/3)"
      % (slope(qds, [n + l for n, l, _ in res]), slope(qds, [e for _, _, e in res]), slope(qds, [n for n, _, _ in res])))
print("cheaper experiments: excess vs experiment price c (hold everything else)")
import twin_recalibration.model as M
base = M.exp_step_cost
cs = []
for scale in (0.1, 0.3, 1.0, 3.0):
    M.exp_step_cost = lambda *aa, _s=scale, **kk: _s * base(*aa, **kk)
    N_, L_, e_ = best_schedule(a, b, 1e-5, ve, exact_cost=False, drift_in_window=False)
    cs.append((scale * c, N_ + L_, N_, e_))
    print("  c=%.3f: T*=%d N*=%d excess=%.5f" % (scale * c, N_ + L_, N_, e_))
M.exp_step_cost = base
print("slope of excess vs c = %.3f (law 1/3): a 10x cheaper experiment (c=%.2f vs %.2f) lowers the excess only %.2fx" % (slope([x[0] for x in cs], [x[3] for x in cs]), cs[0][0], cs[2][0], cs[2][3] / cs[0][3]))

print("\n== 4. Robustness: recalibrate every s T* instead of T* (idealised model, N re-optimised): loss ratio vs (2 s^-1/2 + s)/3 ==")
qd = 1e-5
cf = closed_form(a, b, qd, ve)
print("s      excess/excess*   formula")
for sc in (0.25, 0.5, 2.0, 4.0):
    T = cf['T'] * sc
    Nn = math.sqrt(rho * T / (ve * c))
    Nn = max(round(Nn), 2)
    num = cycle_excess(a, b, qd, Nn, round(T) - Nn, ve, exact_cost=False, drift_in_window=False)
    den = cycle_excess(a, b, qd, round(cf['N']), round(cf['T']) - round(cf['N']), ve, exact_cost=False, drift_in_window=False)
    print("%.2f   %.3f            %.3f" % (sc, num / den, (2 / math.sqrt(sc) + sc) / 3))
print("q misjudged by factor 4 => T off by 4^(2/3)=2.52x: loss <= %.0f%% (s=2.52), %.0f%% (s=1/2.52)" % (100 * ((2 / math.sqrt(2.52) + 2.52) / 3 - 1), 100 * ((2 / math.sqrt(1 / 2.52) + 1 / 2.52) / 3 - 1)))

print("\n== 5. Stability: the second-order optimum sits where a bad estimate can destabilise the loop; the drift can too ==")
print("qd       schedule            N   T      excess   P(fail/cycle) analytic   simulated (3 seeds x 1500 cycles)")
for qd, mf in ((1e-5, 1.0), (1e-5, 1e-3), (1e-4, 1.0), (1e-4, 1e-3), (1e-3, 1.0), (1e-3, 1e-3)):
    N_, L_, e_ = best_schedule(a, b, qd, ve, max_fail=mf)
    pa = fail_prob(a, b, est_var0(N_, ve, qd), qd, L_)
    sm = [simulate(a, b, qd, N_, L_, ve, 1500, seed=s) for s in range(3)]
    print("%.0e   %-18s %3d %6d   %.4f    %.4f                  %s" % (qd, "unconstrained" if mf == 1.0 else "P(fail)<=%.0e" % mf, N_, N_ + L_, e_, pa, ", ".join("%.4f" % f for _, f in sm)))

print("\n== 6. Simulated excess (mean over cycles that did not diverge) vs the model at the safe schedule P(fail) <= 1e-3, 6 seeds ==")
print("qd       N    T     model     sim mean  sim per seed")
for qd in (1e-5, 1e-4, 1e-3):
    N_, L_, e_ = best_schedule(a, b, qd, ve, max_fail=1e-3)
    cyc = max(int(600000 / (N_ + L_)), 400)
    ss = [simulate(a, b, qd, N_, L_, ve, cyc, seed=s)[0] for s in range(6)]
    print("%.0e   %3d %6d   %.4f    %.4f    %s" % (qd, N_, N_ + L_, e_, sum(ss) / 6, " ".join("%.3f" % x for x in ss)))

print("\n== 7. What not using operating data costs: batch schedules vs the always-on Kalman twin of twin-upkeep (same plant) ==")
print("qd       idealised batch (closed form)   safe batch (P(fail)<=1e-3, full model)   Kalman twin   ratio idealised   ratio safe")
ri, rsafe = [], []
for qd in (1e-6, 1e-5, 1e-4, 1e-3):
    ei = closed_form(a, b, qd, ve)['excess']
    e_ = best_schedule(a, b, qd, ve, max_fail=1e-3)[2]
    kr = kalman_regret(a, b, qd)
    ri.append(ei / kr); rsafe.append(e_ / kr)
    print("%.0e   %.4f                          %.4f                                  %.5f       %6.1fx           %6.1fx" % (qd, ei, e_, kr, ei / kr, e_ / kr))
qs = [1e-6, 1e-5, 1e-4, 1e-3]
print("slope of idealised ratio over qd 1e-6..1e-3 = %.3f (small-drift law qd^(1/3-1/2) = -1/6, approached as qd -> 0); safe ratio is not a power law (stability binds)" % slope(qs, ri))

print("\n== 8. Experiment amplitude: c/ve falls to gamma as the input grows (idealised model, qd=1e-5) ==")
for v_ in (0.25, 1.0, 4.0, 16.0):
    cf = closed_form(a, b, 1e-5, v_)
    print("ve=%5.2f  c=%.3f  c/ve=%.3f  T*=%.0f N*=%.1f excess=%.5f" % (v_, cf['c'], cf['c'] / v_, cf['T'], cf['N'], cf['excess']))
