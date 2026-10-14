"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from partial_participation import *

eta, sg, H = 0.5, 1.0, 1
a = 2.0                                   # single mode: s = 1, Vw = eta^2 sigma^2 = 0.25
s, Vw = curvature(eta, a, H), worker_noise(eta, a, sg, H)

print("== 1. Stationary variance: exact vs literal simulation (N=6, alpha=0.8; 300k rounds) ==")
print("p     rule  exact    sim      ratio")
for p in (1.0, 0.6, 0.3):
    for rule, f in (("A", floor_avg), ("B", floor_fixed)):
        th = f([a], eta, sg, 6, p, H, 0.8)               # loss = (a/2) Var = Var here
        emp = simulate_var(rule, s, Vw, 0.8, 6, p, 300000, 1000, seed=1)
        print("%.1f   %s     %.5f  %.5f  %.3f" % (p, rule, th, emp, emp / th))

print("\n== 2. Averaging participants: floor vs everyone present is N E[1/K|K>=1] (>= 1/p); vs a fixed cohort of Np is Np E[1/K|K>=1] ==")
print("N     p     vs-all   vs-cohort  1+(1-p)/(Np)")
for N, p in ((8, 0.5), (8, 0.25), (8, 0.125), (32, 0.1), (100, 0.03), (1000, 0.01)):
    print("%-5d %-5.3f %-8.4f %-10.4f %.4f" % (N, p, penalty_avg(N, p), N * p * inv_mean(N, p), 1 + (1 - p) / (N * p)))

print("\n== 3. Rule B stability: largest alpha*s is 2/c, c = 1+(1-p)/(Np) ==")
for N, p in ((8, 1.0), (8, 0.5), (8, 0.125), (100, 0.03), (16, 0.0625)):
    c = c_factor(N, p)
    print("N=%-4d p=%-6.4f  Np=%-6.2f c=%.3f  alpha_s max=%.3f  fastest contraction 1-1/c=%.3f  (Rule A at alpha s=1: %.3f)"
          % (N, p, N * p, c, 2 / c, 1 - 1 / c, contraction_avg(1.0, N, p)))

print("\n== 4. Matched speed: floor of A vs B at equal per-round mean-square contraction (N=32, p=0.1, s=1, Vw=1) ==")
N, p = 32, 0.1
c = c_factor(N, p)
print("rho     alpha_s(A)  floor A   alpha_s(B)  floor B   A/B")
for xa in (0.02, 0.1, 0.2, 0.3, 0.5):
    rho = contraction_avg(xa, N, p)
    disc = 1 - c * (1 - rho)
    xb = (1 - math.sqrt(disc)) / c
    fa = xa * inv_mean(N, p) / (2 - xa)
    fb = xb / (N * p * (2 - xb * c))
    print("%.3f   %.3f       %.4f    %.3f       %.4f    %.3f" % (rho, xa, fa, xb, fb, fa / fb))
p0 = (1 - p) ** N
print("small-step limit A/B = E[K|K>=1] E[1/K|K>=1] = %.4f" % (N * p / (1 - p0) * inv_mean(N, p)))
print("Rule B fastest rho = %.3f ; Rule A reaches %.3f at alpha s = 1; rho >= p0 = %.3f" % (1 - 1 / c, contraction_avg(1.0, N, p), p0))

print("\n== 5. Participation bias (noise-free): optima c=(0,1,2), equal weights, participation p=(0.9,0.5,0.1) ==")
cc, ww, pp = [0.0, 1.0, 2.0], [0.5, 0.5, 0.5], [0.9, 0.5, 0.1]
print("plain Rule B fixed point  %.4f  (simulated mean %.4f)" % (fixed_point(cc, ww, pp), simulate_bias(cc, ww, pp, 0.5, 100000, 500, seed=2)))
print("inverse-propensity        %.4f  (simulated mean %.4f)" % (fixed_point(cc, ww, pp, ipw=True), simulate_bias(cc, ww, pp, 0.05, 300000, 3000, ipw=True, seed=2)))
print("participation-independent target: %.4f" % fixed_point(cc, ww, [1, 1, 1]))
c2, w2 = [0.0, 1.0], [0.9, 0.1]
for pr in ((1.0, 1.0), (1.0, 0.5), (1.0, 0.1)):
    print("two workers, weights w=(0.9,0.1), p=%s  plain %.4f  IPW %.4f" % (pr, fixed_point(c2, w2, list(pr)), fixed_point(c2, w2, list(pr), ipw=True)))
