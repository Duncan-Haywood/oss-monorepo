"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random

from mount_twin.model import (chord, dead_reckon, fit_rotation, fit_std, integrate, random_path, rot, lap_error_3d,
                              simulate_lap_3d)

print("Mount twin: radar ego-velocity dead reckoning with sensor yawed by e vs body; twin assumes e = 0. Speed 1, dt 1.")

print("\n== 1. Exactness: est = R(-e) truth; error = 2 sin(e/2) |p - p0| (heading random walk, 500 steps, 20 seeds) ==")
print("e(deg)   max |est - R(-e)truth|   max |err - chord*|p||   final err (mean)   final |p| (mean)   err/|p|")
for deg in (1, 2, 5, 10, 20):
    e = math.radians(deg)
    d1 = d2 = fe = fp = 0.0
    for s in range(20):
        ths, vbs = random_path(500, turn=0.05, seed=s)
        tr, es = integrate(ths, vbs), dead_reckon(ths, vbs, e)
        for t, p in zip(tr, es):
            q = rot(-e, t)
            d1 = max(d1, math.hypot(q[0] - p[0], q[1] - p[1]))
            d2 = max(d2, abs(math.hypot(t[0] - p[0], t[1] - p[1]) - chord(e) * math.hypot(*t)))
        fe += math.hypot(tr[-1][0] - es[-1][0], tr[-1][1] - es[-1][1]) / 20
        fp += math.hypot(*tr[-1]) / 20
    print("%-8g %-24.2e %-22.2e %-18.3f %-18.2f %.5f" % (deg, d1, d2, fe, fp, fe / fp))
print("(2 sin(e/2) =", ", ".join("%.5f" % chord(math.radians(d)) for d in (1, 2, 5, 10, 20)), ")")

print("\n== 2. A loop-closure validation cannot see it; a straight run can. e = 10 deg ==")
e = math.radians(10)
n = 400
ths = [2 * math.pi * (k + 0.5) / n for k in range(n)]
vbs = [(50 * 2 * math.pi / n, 0.0)] * n          # circle of radius 50 (path length 314)
tr, es = integrate(ths, vbs), dead_reckon(ths, vbs, e)
end = math.hypot(tr[-1][0] - es[-1][0], tr[-1][1] - es[-1][1])
mx = max(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(tr, es))
print("circle R=50: end-of-lap error %.2e, max error along lap %.2f (= chord*diameter = %.2f)" % (end, mx, chord(e) * 100))
ths, vbs = [0.0] * 157, [(1.0, 0.0)] * 157      # same path length, straight
tr, es = integrate(ths, vbs), dead_reckon(ths, vbs, e)
print("straight 157 m: end error %.2f (= chord*157 = %.2f); out-and-back of the same length: end error %.2e" % (
    math.hypot(tr[-1][0] - es[-1][0], tr[-1][1] - es[-1][1]), chord(e) * 157,
    math.hypot(*[a - b for a, b in zip(integrate([0.0] * 157 + [math.pi] * 157, [(1.0, 0.0)] * 314)[-1],
                                       dead_reckon([0.0] * 157 + [math.pi] * 157, [(1.0, 0.0)] * 314, e)[-1])])))

print("\n== 3. Calibrating e from position fixes (sigma per fix), closed-form rotation fit, true e = 5 deg, 4000 MC trials ==")
print("path         n_fix  sigma  sqrt(sum|p|^2)   MC std(e_hat) deg   formula deg   MC mean(e_hat) deg   95% CI covers 5 deg")
e = math.radians(5)
for name, turn, n, sigma in (("straight", 0.0, 100, 1.0), ("straight", 0.0, 400, 1.0), ("wiggly", 0.05, 400, 1.0),
                             ("wiggly", 0.05, 400, 5.0), ("tight-loop", 0.3, 400, 1.0)):
    ths, vbs = random_path(n, turn=turn, seed=7)
    tr, es = integrate(ths, vbs), dead_reckon(ths, vbs, e)
    r = random.Random(11)
    a = []
    for _ in range(4000):
        ref = [(p[0] + r.gauss(0, sigma), p[1] + r.gauss(0, sigma)) for p in tr]
        a.append(fit_rotation(es, ref))
    m = sum(a) / len(a)
    sd = (sum((x - m) ** 2 for x in a) / 3999) ** 0.5
    fs = fit_std(sigma, es)
    cov = sum(abs(x - e) < 1.96 * fs for x in a) / len(a)
    print("%-12s %-6d %-6g %-16.1f %-19.4f %-13.4f %-20.4f %.3f" % (name, n, sigma, math.sqrt(sum(p[0] ** 2 + p[1] ** 2 for p in es)),
                                                                    math.degrees(sd), math.degrees(fs), math.degrees(m), cov))

print("\n== 4. Not a 2-D effect: pitched mount on a level circle (radius 5, e = 5 deg), vertical drift ==")
e = math.radians(5)
print("laps   z error (sim)   laps*2 pi R sin e   x-y closure error")
for laps in (1, 2, 5, 10):
    x, y, z = simulate_lap_3d(e, 5.0, laps)
    print("%-6d %-15.4f %-19.4f %.2e" % (laps, z, lap_error_3d(e, 5.0, laps), math.hypot(x, y)))
print("(a yaw mount error is bounded by the path diameter; a pitch/roll mount error grows linearly with distance and is not removed by x-y loop closure)")
