import math, random
from speed_race import *

print("E1 closed form pi'(1) = (1-k/n)(H_n-H_{n-k}) vs telescoped sum vs central difference of exact pi")
for n, k in [(8, 1), (8, 4), (32, 8), (32, 24), (32, 31)]:
    print(f"  n={n:2d} k={k:2d}  sum {dpi(n,k):.10f}  closed {dpi_closed(n,k):.10f}  finite-diff {dpi_numeric(n,k):.10f}")

print("E2 the symmetric profile is a global best response (R=3, c=1, grid over deviation rate up to 6x)")
for n, k in [(6, 1), (6, 3), (10, 4), (10, 8), (24, 12)]:
    R, c = 3.0, 1.0
    m = eq_speed(n, k, R, c)
    rate, u = best_response(n, k, R, c, m)
    print(f"  n={n:2d} k={k:2d}  m*={m:.4f}  payoff at m* {R*k/n - c*m:.4f}  best deviation payoff {max(u, 0):.4f} at rate {rate:.4f}  (0 = stay/leave)")

print("E3 simulation: deviator at 1.5 m* among n=8, k=3 (R=2, c=1), 60000 races, seed 3")
rng = random.Random(3)
n, k = 8, 3
m = eq_speed(n, k, 2.0, 1.0)
rates = [m] * n; rates[0] = 1.5 * m
paid, t = simulate_race(n, k, rates, rng, 60000)
_, t0 = simulate_race(n, k, [m] * n, rng, 60000)
print(f"  pi(1.5) exact {pi(n,k,1.5):.4f} sim {paid[0]:.4f} ; round time at m*: exact {round_time(n,k,m):.4f} sim {t0:.4f}; formula n c/((n-k)R) = {n/((n-k)*2.0):.4f}")

print("E4 what k buys (n=32, R=1, c=1): equilibrium speed, round time, share of the prize pool burned on speed")
for k in (1, 2, 4, 8, 16, 24, 30, 31, 32):
    mm = eq_speed(32, k, 1.0, 1.0)
    print(f"  k={k:2d}  m*={mm:.4f}  round time {round_time(32,k,mm):.4f}  burned {dissipation(32,k):.3f}  worker rent {1.0*k/32-mm:.4f}")

print("E5 fixed budget B=10, c=1, n=32: round time n c k/((n-k)B)")
for k in (1, 2, 4, 8, 16, 24, 31):
    print(f"  k={k:2d}  prize R={10/k:.3f}  round time {time_given_budget(32,k,10.0,1.0):.4f}")

print("E6 add accuracy (a=1, eta=0.2, sigma2=2, x0^2=1, n=32, c=1): optimal k under budget B, versus the pure-speed choice k=1")
for eps in (0.20, 0.10, 0.05, 0.03):
    rows = []
    for B in (2.0, 10.0, 50.0):
        k, t = best_k_accuracy(32, B, 1.0, 1.0, 0.2, 2.0, 1.0, eps)
        rows.append(f"B={B:g}: k*={k} T={t:.2f}")
    kmin = (0.2**2 * 2.0 / (1 - (1 - 0.2) ** 2)) / eps
    print(f"  eps={eps:.2f} (k_min={kmin:.2f})  " + "   ".join(rows))

print("E7 entry does not speed the race: fixed k, fixed prize R=1, c=1; round time n c/((n-k)R) falls only to c/R")
for k in (1, 4):
    print("  k=%d  " % k + "   ".join(f"n={n}: T={round_time(n,k,eq_speed(n,k,1.0,1.0)):.3f}" for n in (k + 1, 8, 32, 128, 1024)))
print("  fixed fraction k=n/2:  " + "   ".join(f"n={n}: T={round_time(n,n//2,eq_speed(n,n//2,1.0,1.0)):.3f}" for n in (8, 32, 128, 1024)))
print("  total speed bought n m*, k=4, R=1: " + "   ".join(f"n={n}: {n*eq_speed(n,4,1.0,1.0):.3f}" for n in (8, 32, 128, 1024)))
