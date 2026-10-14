"""Occupancy-cell commit with a twin-tuned mapper. Twin hit rates q1=0.8 (occupied), q0=0.05 (free); target error eps=1e-3 at A=ln((1-eps)/eps)."""
import math, random
from occupancy_twin import *

q1, q0, eps = 0.8, 0.05, 1e-3
a, b = llr(q1, q0)
A = threshold(eps)
rng = random.Random(0)
print(f"twin: a={a:.4f} b={b:.4f}  design A={A:.3f}  target eps={eps}\n")

print("1. FREE cell, real false-hit rate p0 (twin says 0.05): exact error vs sandwich vs simulation")
print(f"{'p0':>5} {'theta*':>7} {'lower':>10} {'exact':>10} {'upper':>10} {'MC(2e4)':>9} {'infl':>7} {'E[T]':>6}")
for p0 in (0.05, 0.10, 0.15, 0.20, 0.30):
    lo, hi = error_bounds(p0, a, b, A)
    w, et, _ = exact_error(p0, a, b, A)
    mc = mc_error(p0, a, b, A, rng)
    print(f"{p0:5.2f} {theta_star(p0,a,b):7.3f} {lo:10.2e} {w:10.2e} {hi:10.2e} {mc:9.2e} {w/eps:7.1f} {et:6.1f}")

print("\n2. OCCUPIED cell, real hit rate p1 (twin says 0.80): missed-detection error")
print(f"{'p1':>5} {'theta*':>7} {'exact':>10} {'infl':>7}")
for p1 in (0.8, 0.7, 0.6, 0.5):
    pr, ar, br = reflect(p1, a, b)
    w = exact_error(pr, ar, br, A)[0]
    print(f"{p1:5.2f} {theta_star(pr,ar,br):7.3f} {w:10.2e} {w/eps:7.1f}")

print("\n3. Tempering: commit at A/theta* instead of A (free cell, real p0)")
print(f"{'p0':>5} {'A_temp':>7} {'error':>10} {'E[T] plain':>11} {'E[T] temp':>10} {'delay x':>8}")
for p0 in (0.10, 0.15, 0.20, 0.30):
    At = tempered_threshold(p0, a, b, eps)
    w, et, _ = exact_error(p0, a, b, At)
    et0 = exact_error(p0, a, b, A)[1]
    print(f"{p0:5.2f} {At:7.2f} {w:10.2e} {et0:11.1f} {et:10.1f} {et/et0:8.2f}")

print("\n4. Calibration budget: estimate p0 from n known-free real observations, plug in theta*, commit at ln(1/eps)/theta_hat (p0=0.15)")
p0 = 0.15
ts = theta_star(p0, a, b)
print(f"true theta*={ts:.3f}; 300 replicates per n")
print(f"{'n':>5} {'sd(th) sim':>10} {'sd(th) delta':>12} {'mean err/eps':>13} {'P(err>2eps)':>12} {'P(err>eps)':>11}")
for n in (20, 50, 200, 1000):
    errs, th = [], []
    for _ in range(300):
        ph = sum(rng.random() < p0 for _ in range(n)) / n
        t = plugin_theta(ph, a, b)
        th.append(t)
        Ah = math.log(1 / eps) / t if t > 1e-3 else 60.0
        errs.append(exact_error(p0, a, b, min(Ah, 60.0))[0])
    m = sum(th) / len(th)
    sd = math.sqrt(sum((x - m) ** 2 for x in th) / len(th))
    print(f"{n:5d} {sd:10.3f} {theta_delta_sd(p0,a,b,n):12.3f} {sum(errs)/len(errs)/eps:13.2f} "
          f"{sum(e > 2*eps for e in errs)/len(errs):12.2f} {sum(e > eps for e in errs)/len(errs):11.2f}")
