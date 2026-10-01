"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from intent_twin import *

print("A robot infers which of two goals a human heads to from noisy cues (cue points at the true goal w.p. p).")
print("It commits when the lead |S| reaches h. Twin: cue accuracy p_s; real human: p. Target error alpha in the twin.\n")

print("== 0. closed forms vs simulation (60000 trials per row) ==")
print("p     h   err exact  err sim   E[T] exact  E[T] sim")
rng = random.Random(1)
for p, h in ((0.7, 4), (0.7, 6), (0.6, 8), (0.9, 3), (0.5, 5)):
    e, t = simulate(rng, p, h, 60000)
    print("%-5g %-3d %-10.5f %-9.5f %-11.3f %.3f" % (p, h, err(p, h), e, exp_time(p, h), t))

print("\n== 1. designed in a twin, run on the real human (alpha = 1e-3) ==")
print("p_s   h   twin err  |  real p  real err  real err/alpha  alpha^theta  real E[T]  twin E[T]")
alpha = 1e-3
for ps in (0.9, 0.8, 0.7):
    h = design_h(ps, alpha)
    for p in (0.95, 0.8, 0.7, 0.6):
        print("%-5g %-3d %-9.2e |  %-6g %-9.2e %-15.2f %-12.2e %-10.2f %.2f" % (
            ps, h, err(ps, h), p, err(p, h), err(p, h) / alpha, err_asym(p, ps, alpha), exp_time(p, h), exp_time(ps, h)))

print("\n== 2. same, checked by simulation (p_s=0.9, alpha=1e-3, 200000 trials) ==")
rng = random.Random(2)
h = design_h(0.9, alpha)
for p in (0.7, 0.6):
    e, t = simulate(rng, p, h, 200000)
    print("h=%d real p=%g: exact err %.5f, simulated %.5f; exact E[T] %.2f, simulated %.2f" % (h, p, err(p, h), e, exp_time(p, h), t))

print("\n== 3. a twin that is too irrational is safe but slow (p_s=0.6, alpha=1e-3) ==")
h6 = design_h(0.6, alpha)
print("h = %d in the twin (E[T] there %.1f)" % (h6, exp_time(0.6, h6)))
for p in (0.7, 0.8, 0.9):
    print("real p=%g: real err %.2e, E[T] %.1f vs best integer h for real p: h=%d, E[T] %.1f (%.1fx slower)" % (
        p, err(p, h6), exp_time(p, h6), design_h(p, alpha), exp_time(p, design_h(p, alpha)), exp_time(p, h6) / exp_time(p, design_h(p, alpha))))

print("\n== 4. a population of humans, Beta(a,b) cue accuracy, twin uses the mean (alpha = 0.05) ==")
print("Population error floor as h -> infinity is P(p < 1/2) (those humans mislead the robot).")
print("a,b        mean  sd     P(p<.5)  h_twin  twin err  pop err  h_pop  pop E[T] at h_pop  E[T] twin-mean human at h_twin")
for a, b in ((160, 40), (48, 12), (21, 9), (14, 6)):
    m = a / (a + b)
    sd = math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1)))
    ps, w = None, None
    floor = beta_pop_err(a, b, 4000)  # h = 4000
    ht = design_h(m, 0.05)
    hp = design_h_pop(a, b, 0.05)
    print("%-3d,%-3d    %-5.2f %-6.3f %-8.4f %-7d %-9.4f %-8.4f %-6s %-18s %.1f" % (
        a, b, m, sd, floor, ht, err(m, ht), beta_pop_err(a, b, ht), hp if hp else "none",
        ("%.1f" % beta_pop_time(a, b, hp)) if hp else "-", exp_time(m, ht)))

print("\n== 5. calibrating the twin from n real cues (p=0.7, alpha = 0.01; exact over Binomial(n,0.7)) ==")
print("Target design h for known p: h=%d (err %.4f). Rows: point estimate (z=0) vs lower confidence bound (z=1.645)." % (design_h(0.7, 0.01), err(0.7, design_h(0.7, 0.01))))
print("n      z      mean real err  P(real err > alpha)  mean h  mean real E[T]")
for n in (10, 20, 50, 200, 1000):
    for z in (0.0, 1.645):
        me, pb, mt, mh = demo_design_stats(0.7, n, 0.01, z)
        print("%-6d %-6g %-14.5f %-20.4f %-7.1f %.1f" % (n, z, me, pb, mh, mt))
