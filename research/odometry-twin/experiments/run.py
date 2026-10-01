"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from odometry_twin import *

S1, NU, G, TOL, DELTA = 0.02, 0.05, 3.0, 0.5, 0.05
NOM = 2 * Phi(G) - 1
print("Along-track odometry: per-step error s1=%.2f m (sb^2+sw^2), persistent bias fraction rho=sb^2/s1^2; closure noise nu=%.2f m, gate g=%g sigma (nominal recall %.4f), tolerance %.1f m, target miss %.2f." % (S1, NU, G, NOM, TOL, DELTA))
print("Twin: fitted to one-step increments, treats them as white, Var(T)=T s1^2.  Real: Var(T)=s1^2 (rho T^2 + (1-rho) T).")

print("\n== 1. Variance growth: twin vs real (checked against 30000 simulated traversals) ==")
rng = random.Random(1)
print("rho    T     twin sd (m)  real sd (m)  exact ratio  simulated ratio")
for rho in (0.01, 0.05, 0.2):
    for T in (10, 100, 400):
        es = [sample_error(T, S1, rho, rng) for _ in range(30000)]
        print("%-6g %-5d %.3f        %.3f        %.2f         %.2f" % (rho, T, math.sqrt(var_twin(T, S1)), math.sqrt(var_real(T, S1, rho)), ratio(T, rho), fit_ratio(es, T, S1)))

print("\n== 2. Relocalisation interval for P(|E|>%.1f m) <= %.2f ==" % (TOL, DELTA))
Tt = interval_twin(TOL, S1, DELTA)
print("twin interval T_twin = %.0f steps" % Tt)
print("rho    real interval  T_twin/T_real  real miss prob at T_twin (twin claims %.2f)" % DELTA)
for rho in (0.01, 0.05, 0.2, 1.0):
    Tr = interval_real(TOL, S1, rho, DELTA)
    print("%-6g %-14.0f %-14.1f %.3f" % (rho, Tr, Tt / Tr, miss_prob(var_real(Tt, S1, rho), TOL)))

print("\n== 3. Loop-closure recall of a gate tuned in the twin (true closures accepted) ==")
print("rho=0.05 unless stated; nominal %.4f" % NOM)
print("T      twin gate   calibrated gate   | rho=0.01 twin   rho=0.2 twin")
for T in (10, 50, 100, 200, 400, 1000, 4000):
    print("%-6d %.3f       %.4f            | %.3f           %.3f" % (T, recall(T, S1, 0.05, NU, G), recall(T, S1, 0.05, NU, G, "real"), recall(T, S1, 0.01, NU, G), recall(T, S1, 0.2, NU, G)))
print("Aliased closure (place-recognition mismatch) shifted by d=1.0 m, rho=0.05:")
print("T      twin gate accepts   calibrated gate accepts")
for T in (50, 200, 1000):
    print("%-6d %.3f               %.3f" % (T, false_accept(T, S1, 0.05, NU, G, 1.0), false_accept(T, S1, 0.05, NU, G, 1.0, "real")))

print("\n== 4. Closed loop: repeated segments, filter belief P, closure at each segment end (400 segments x 200 runs) ==")
print("rho=0.05, alias prob q=0.1, alias offset d=1.0 m; metric: share of segments with |x|>%.1f m after the update; RMS x; share of true / aliased closures accepted" % TOL)
print("T     gate         exceed   rms(m)   true acc  alias acc")
for T in (50, 200, 800):
    for model in ("twin", "real"):
        rs = [simulate_chain(T, S1, 0.05, NU, G, 0.1, 1.0, TOL, model, random.Random(1000 + s), segments=400) for s in range(200)]
        m = [sum(r[i] for r in rs) / len(rs) for i in range(4)]
        print("%-5d %-12s %.3f    %.3f    %.3f     %.3f" % (T, {"twin": "twin", "real": "calibrated"}[model], *m))
print("no aliasing (q=0):")
for T in (50, 200, 800):
    for model in ("twin", "real"):
        rs = [simulate_chain(T, S1, 0.05, NU, G, 0.0, 0.0, TOL, model, random.Random(2000 + s), segments=400) for s in range(200)]
        m = [sum(r[i] for r in rs) / len(rs) for i in range(4)]
        print("%-5d %-12s %.3f    %.3f    %.3f" % (T, {"twin": "twin", "real": "calibrated"}[model], m[0], m[1], m[2]))

print("\n== 5. Repair: inflate the twin variance by a ratio fitted from n real ground-truth traversals at lag T (T=200, rho=0.05, ratio %.2f) ==" % ratio(200, 0.05))
rng = random.Random(4)
print("n     mean recall   mean alias accept (d=1.0)   [twin: %.3f / %.3f, calibrated: %.4f / %.3f]" % (recall(200, S1, 0.05, NU, G), false_accept(200, S1, 0.05, NU, G, 1.0), recall(200, S1, 0.05, NU, G, "real"), false_accept(200, S1, 0.05, NU, G, 1.0, "real")))
for n in (1, 2, 5, 10, 20, 50, 100, 500):
    r, f = recall_with_estimate(200, S1, 0.05, NU, G, n, rng, reps=6000, d=1.0)
    print("%-5d %.4f        %.3f" % (n, r, f))
print("Lag mismatch: ratio fitted at T=50 then used at other T (n=100, rho=0.05); the fitted constant is not a law in T")
for Tfit in (50,):
    Rfit = ratio(Tfit, 0.05)
    for T in (50, 200, 1000):
        print("T=%-5d recall with constant ratio %.2f: %.3f (calibrated %.4f)" % (T, Rfit, recall(T, S1, 0.05, NU, G, "infl", Rfit), recall(T, S1, 0.05, NU, G, "real")))
