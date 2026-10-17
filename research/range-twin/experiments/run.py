"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import random
from range_twin.model import *

print("Range twin: real sensor reads clip(x, -R, R), twin reads x.  P loop x+=x-k*y; PI loop z+=y, x+=-(kp*y+ki*z).")

print("\n== 1. P loop: exact step-count law vs simulation (R=1, tol=1e-3, k=0.25) ==")
print("x0/R   twin steps  real steps (law)  real steps (sim)  real/twin")
for x0 in (0.5, 1, 2, 5, 10, 50, 200, 1000):
    xs = run_p(0.25, 1.0, x0, 20000)
    sim, law, tw = steps_to_tol(xs, 1e-3), real_steps(0.25, 1.0, x0, 1e-3), twin_steps(0.25, x0, 1e-3)
    print("%-6g %-11d %-17d %-17d %.2f" % (x0, tw, law, sim, law / tw if tw else float('nan')))
bad = 0
n = 0
for k in (0.05, 0.1, 0.25, 0.5, 0.75, 0.9):
    for x0 in (1.2, 3, 7, 30, 123.4, 5000):
        for tol in (0.45, 1e-2, 1e-6):   # 0.45 not 0.5: (k=0.9, x0=5000, tol=0.5) is an exact tie, decided by rounding
            n += 1
            bad += steps_to_tol(run_p(k, 1.0, x0, 200000), tol) != real_steps(k, 1.0, x0, tol)
print("law vs simulation over %d (k, x0, tol) cases: %d mismatches" % (n, bad))
print("large-x0 slope: d(steps)/d(x0/R) = 1/k = %.1f for k=0.25 (sim: %.2f between x0/R=500 and 1000)" % (
    4.0, (steps_to_tol(run_p(0.25, 1.0, 1000, 20000), 1e-3) - steps_to_tol(run_p(0.25, 1.0, 500, 20000), 1e-3)) / 500))

print("\n== 2. PI loop from x0 = x_frac*R (R=1; twin from the same x0; tol=0.01R): overshoot and settling time ==")
for kp, ki in ((0.5, 0.1), (0.3, 0.05), (0.5, 0.2)):
    print("\n(kp,ki)=(%g,%g): twin spectral radius %.3f" % (kp, ki, twin_radius(kp, ki)))
    print("x0/R   twin os/R  real os/R  frozen os/R  twin settle  real settle  frozen settle")
    for x0 in (1, 2, 5, 10, 30, 100, 1000):
        tw = run_pi(kp, ki, 1e18, x0, 60000)
        re = run_pi(kp, ki, 1.0, x0, 60000)
        fz = run_pi(kp, ki, 1.0, x0, 60000, freeze=True)
        print("%-6g %-10.3f %-10.3f %-12.3f %-12d %-12d %-14d" % (
            x0, overshoot(tw), overshoot(re), overshoot(fz), settle_index(tw, 0.01), settle_index(re, 0.01),
            settle_index(fz, 0.01)))

print("\n== 3. Exact scale invariance of the PI loop, (kp,ki)=(0.5,0.1), x0/R=20 ==")
ref = None
for r in (0.01, 1.0, 100.0):
    xs = run_pi(0.5, 0.1, r, 20 * r, 4000)
    print("R=%-6g overshoot/R = %.9f  settle(1%%R) = %d" % (r, overshoot(xs) / r, settle_index([v / r for v in xs], 0.01)))

print("\n== 4. Gain a twin fits from logs whose x is uniform on [-L, L] (R=1, true k=0.25) ==")
print("L/R   closed-form factor  Monte Carlo (n=20000, mean of 50)  twin-predicted steps from x0=50R, tol=1e-3  true steps")
true = real_steps(0.25, 1.0, 50, 1e-3)
rng = random.Random(7)
for l in (0.5, 1, 1.5, 2, 3, 5, 10, 50):
    facs = []
    for _ in range(50):
        xs = [rng.uniform(-l, l) for _ in range(20000)]
        facs.append(sum(x * clip(x, 1.0) for x in xs) / sum(x * x for x in xs))
    f = fitted_gain_factor(1.0, l)
    kh = 0.25 * f
    print("%-5g %-19.4f %-35.4f %-44d %d" % (l, f, sum(facs) / len(facs), twin_steps(kh, 50, 1e-3), true))
print("A validation whose states never exceed R (L <= R) fits the gain exactly (factor 1.0000) and cannot reveal R;")
print("a twin validated out to L = 2R still underestimates: its fitted gain is %.3f of the truth." % fitted_gain_factor(1.0, 2.0))
