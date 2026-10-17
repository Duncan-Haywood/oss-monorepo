"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from delayed_outer import *

A = [1.0, 0.25, 0.05]
eta, sg, N, H = 0.2, 1.0, 8, 4
S = [curvature(eta, a, H) for a in A]

print("== 1. Stability limit c_max = 2 sin(pi/(4 tau+2)) (c = alpha s); radius 1 exactly there ==")
print("tau  c_max    pi/(2tau+1)  radius(0.999 c_max)  radius(1.001 c_max)  alpha_max (s=%.3f)" % max(S))
for t in (0, 1, 2, 3, 5, 8, 16):
    cm = c_max(t)
    print("%-4d %.4f   %.4f       %.5f              %.5f              %.3f" % (t, cm, math.pi / (2 * t + 1), spectral_radius(cm * .999, t), spectral_radius(cm * 1.001, t), alpha_max(max(S), t)))

print("\n== 2. Exact stationary variance (closed forms tau<=1, Yule-Walker beyond): Var x / e2 ==")
print("c      tau=0      tau=1      tau=2      tau=4      ratio tau=1/tau=0")
for c in (0.05, 0.2, 0.5, 0.8, 0.95):
    print("%.2f   " % c + "  ".join(("%9.3f" % var_delay(c, t)) for t in (0, 1, 2, 4)) + "   %.3f" % (var_delay(c, 1) / var_delay(c, 0)))

print("\n== 3. Exact floor vs literal delayed DiLoCo simulation (one mode a=0.5, eta=.2, N=4, H=3; 300k rounds) ==")
print("tau  alpha   exact     sim       ratio")
for t, al in ((0, 0.4), (1, 0.4), (2, 0.4), (2, 0.8), (4, 0.4)):
    th = floor([0.5], eta, sg, 4, 3, al, t)
    emp = simulate_floor(0.5, eta, sg, 4, 3, al, t, 300000, 1000, seed=10 + t)
    print("%-4d %.2f    %.5f  %.5f  %.3f" % (t, al, th, emp, emp / th))

print("\n== 4. Floor at fixed step, three modes a=1,.25,.05, H=4, N=8 ==")
print("alpha   tau=0     tau=1     tau=2     tau=3     tau=5")
for al in (0.1, 0.3, 0.5, 0.8):
    print("%.2f   " % al + "  ".join(("%8.5f" % floor(A, eta, sg, N, H, al, t)) if alpha_max(max(S), t) > al else "  unstable" for t in (0, 1, 2, 3, 5)))
print("alpha_max: " + "  ".join("tau=%d: %.3f" % (t, alpha_max(max(S), t)) for t in (0, 1, 2, 3, 5)))

print("\n== 5. Fastest deterministic rate of a single mode: c* = tau^tau/(tau+1)^(tau+1), radius tau/(tau+1) ==")
print("tau  c*        radius(c*)  radius(0.7c*)  radius(1.3c*)  rounds for x1e-3 at c*")
for t in (1, 2, 3, 5, 8):
    cs = c_fast(t)
    print("%-4d %.5f   %.4f      %.4f         %.4f         %.1f" % (t, cs, spectral_radius(cs, t, 20000), spectral_radius(.7 * cs, t, 20000), spectral_radius(1.3 * cs, t, 20000), math.log(1e3) / -math.log(rate_fast(t))))

print("\n== 6. Iso-floor wall-clock: largest step with stationary loss <= F, time to shrink the slowest mode 1000x ==")
F0 = floor(A, eta, sg, N, H, 0.3, 0)
print("target floor F = %.5f (tau=0 at alpha=0.3)   Tc = 1" % F0)
print("latency L/Tc  tau  alpha   round time  rounds  wall-clock")
for lam in (0, 1, 3, 7, 15):
    best = None
    rows = []
    for t in range(0, 17):
        al = alpha_for_floor(A, eta, sg, N, H, t, F0)
        r = rounds_to_shrink(A, eta, H, al, t, 1e3)
        w = r * round_time(1.0, lam, t)
        rows.append((t, al, round_time(1.0, lam, t), r, w))
        if best is None or w < best[4]:
            best = rows[-1]
    for t, al, rt, r, w in rows:
        if t in (0, 1, 2, 4, 8, 16) or t == best[0]:
            print("%-13d %-4d %.3f   %.2f        %-7.0f %-8.0f%s" % (lam, t, al, rt, r, w, "  <-- best" if t == best[0] else ""))
    print("  no-overlap wall-clock %.0f, best overlapped %.0f (tau=%d), speedup %.2fx" % (rows[0][4], best[4], best[0], rows[0][4] / best[4]))
