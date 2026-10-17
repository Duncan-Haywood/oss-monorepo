"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random
from saturation_twin import *

A, B, Q, R, U = 1.2, 1.0, 1.0, 0.1, 1.0
L = limit(A, U)
K = lqr_gain(A, B, Q, R)
print(f"plant a={A}, b={B}, limit U={U}, loss-of-control radius L=U/(a-1)={L:.3f}; twin LQR gain K={K:.4f} (pole {A-B*K:+.4f})")

print("\n== E1  mean steps to loss of control from x=0: twin (no limit) vs real (limit U), by noise sd s")
print("  s     twin T        real T      twin/real     twin sat. rate P(|Kx|>U)")
for s in (0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0):
    tw = mean_exit_time(A, B, K, None, s, L, U_model=None)
    re = mean_exit_time(A, B, K, U, s, L, U_model=U)
    if tw > 1e10:   # solve conditioning ~ 1/eps: not resolvable in double precision
        print(f"  {s:<5} {'>1e10 (n/r)':>12} {re:11.4g} {'n/r':>12}   {twin_sat_rate(A,B,K,s,U):.4f}")
    else:
        print(f"  {s:<5} {tw:12.4g} {re:11.4g} {tw/re:12.4g}   {twin_sat_rate(A,B,K,s,U):.4f}")

print("\n== E2  discretisation check (s=1.0, real): N cells")
for N in (60, 120, 240, 480):
    print(f"  N={N:<4} T={mean_exit_time(A, B, K, U, 1.0, L, N=N, U_model=U):.6g}")

print("\n== E3  Monte Carlo vs exact (2,000 runs)")
rng = random.Random(0)
for name, Um in (("real", U), ("twin", None)):
    for s in (1.5, 2.0):
        n = 2000
        sims = [simulate_exit(A, B, K, Um, s, L, rng) for _ in range(n)]
        m = sum(sims) / n
        se = (sum((x - m) ** 2 for x in sims) / (n - 1) / n) ** 0.5
        ex = mean_exit_time(A, B, K, Um, s, L, U_model=Um)
        print(f"  {name} s={s}: exact {ex:.2f}  simulated {m:.2f} +- {se:.2f}")

print("\n== E4  twin-tuned gain vs gain tuned for the real limit (maximise mean exit time; grid K in 0.30..2.40 step 0.10)")
Ks = [0.30 + 0.10 * i for i in range(22)]
print("  s     twin-best K   real T at twin-best K   real-best K   real T at real-best K   gain factor")
for s in (0.8, 1.0, 1.5):
    kt, _ = best_gain(A, B, s, L, None, Ks)
    Tt = mean_exit_time(A, B, kt, U, s, L, N=160, U_model=U)
    kr, Tr = best_gain(A, B, s, L, U, Ks, U_real=U)
    print(f"  {s:<5} {kt:8.2f}     {Tt:14.4g}        {kr:8.2f}     {Tr:16.4g}        {Tr/Tt:8.3g}")

print("\n== E5  T at each gain, s=1.0 (real vs twin)")
for k in (0.4, 0.8, 1.1026, 1.5, 1.8, 2.0, 2.2):
    print(f"  K={k:<6} real {mean_exit_time(A,B,k,U,1.0,L,U_model=U):10.4g}   twin {mean_exit_time(A,B,k,None,1.0,L,U_model=None):12.4g}")

print(f"\n== E6  d ln T / d(1/s^2): large-deviation exponent (twin prediction L^2(1-m^2)/2 = {L*L*(1-(A-B*K)**2)/2:.3f}, m=a-bK)")
prev = None
for s in (1.5, 1.2, 1.0, 0.9, 0.8):
    T = mean_exit_time(A, B, K, U, s, L, U_model=U)
    tw = mean_exit_time(A, B, K, None, s, L, U_model=None)
    x = 1 / s ** 2
    if prev:
        print(f"  s={s}: real {(math.log(T)-prev[0])/(x-prev[2]):.3f}  twin {(math.log(tw)-prev[1])/(x-prev[2]):.3f}")
    prev = (math.log(T), math.log(tw), x)
