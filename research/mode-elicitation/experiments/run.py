import math, random
from mode_elicitation import *

print("E1 bimodal drift 0.7*N(0,1)+0.3*N(mu,1), alpha=1: mean vs alpha-mode")
print(" mu   mean    alpha-mode  window mass at mode / at mean   sq-regret of mode (mean elicited)")
for mu in (3, 4, 6, 10):
    comps = [(.7, 0.0), (.3, float(mu))]
    m, mean = alpha_mode(1.0, comps), mixture_mean(comps)
    print(f" {mu:<4d} {mean:5.2f}  {m:9.3f}   {window_mass(m,1.0,comps):.3f} / {window_mass(mean,1.0,comps):.3f}"
          f"           {sq_regret(m, comps):.3f}")

print("\nE2 critical window: 50/50 N(0,1)+N(mu,1); alpha* solves ln((a+al)/(a-al)) = 2*a*al, a=mu/2")
for mu in (2.5, 3, 4, 6, 10):
    ac = critical_alpha(mu)
    comps = [(.5, 0.0), (.5, float(mu))]
    below, above = alpha_mode(ac * .9, comps), alpha_mode(ac * 1.1, comps)
    print(f" mu={mu:<4g} alpha*={ac:.4f}   mode(0.9a*)={below:.3f}  mode(1.1a*)={above:.3f}  (mu/2={mu/2})")

print("\nE3 curvature (regret/delta^2) at the mode and best window")
for kind, s in (("normal", 1.0), ("cauchy", 1.0)):
    best = best_alpha(s) if kind == "normal" else cauchy_best_alpha(s)
    print(f" {kind}: best alpha={best:.4f}  curvature={curvature(best, kind, s):.4f}")
    for al in (0.25, 0.5, best, 2.0, 4.0):
        print(f"   alpha={al:.3f}  curvature={curvature(al, kind, s):.4f}  ratio to best={curvature(al,kind,s)/curvature(best,kind,s):.3f}")

print("\nE4 detection: report 1.0 above the alpha-mode, 0.7*N(0,1)+0.3*N(4,1), alpha=1, z=1.645")
comps = [(.7, 0.0), (.3, 4.0)]
rs = alpha_mode(1.0, comps)
for d in (0.25, 0.5, 1.0, 2.0):
    mean, var = diff_stats(rs + d, rs, 1.0, comps)
    print(f" shift {d:<5g} regret={mean:.5f}  var={var:.4f}  n={detection_n(mean, var):.0f}")

print("\nE5 estimation from n=2000 samples, contamination eps at +5 sigma (N(0,1)), alpha=1, 200 runs")
rng = random.Random(0)
print(" eps    mean bias   alpha-mode bias   RMSE(mean)  RMSE(mode)")
for eps in (0.0, 0.1, 0.2, 0.3, 0.4):
    me, mo = [], []
    for _ in range(200):
        xs = [rng.gauss(5, 1) if rng.random() < eps else rng.gauss(0, 1) for _ in range(2000)]
        me.append(sum(xs) / len(xs))
        mo.append(empirical_alpha_mode(xs, 1.0))
    rm = lambda v: math.sqrt(sum(x * x for x in v) / len(v))
    print(f" {eps:<5g} {sum(me)/200:9.3f} {sum(mo)/200:12.3f}   {rm(me):10.3f} {rm(mo):10.3f}")
