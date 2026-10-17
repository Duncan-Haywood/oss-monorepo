"""Experiments for inference-substitution. Seeded Monte Carlo; stdlib only."""
import math, random
from inference_substitution import *

V, ALPHA, G = 30, 0.05, 16
P = zipf(V)
GR = p_grid(G)
rng = random.Random(7)
sp_cache = {}

print(f"Setup: vocab {V} Zipf(1.1) claimed model P; alpha={ALPHA}; grid of {G} log-spaced fractions in [0.02,1]; L=ln(G/alpha)={math.log(G/ALPHA):.2f}")

print("\nE1. How different is the cheap model? Q ~ P^beta")
for b in (0.3, 0.5, 0.7, 0.9):
    Q = tilt(P, b)
    print(f"beta={b}: KL(Q||P)={kl(Q, P):.4f} chi2={chi2(Q, P):.4f}")

Q = tilt(P, 0.5)
c2 = chi2(Q, P)
print(f"\nUsing beta=0.5: chi2={c2:.4f}, KL={kl(Q, P):.4f}")

print("\nE2. False alarms under an honest provider (p=0), 1500 checked queries, 400 runs")
for a in (0.05, 0.2):
    print(f"alpha={a}: false-alarm rate {false_alarm_rate(P, Q, 1.0, a, 1500, 400, rng, GR):.4f}")

print("\nE3. Detection delay vs cheating fraction p (f=1, 40 runs each; theory = L/KL(mix_p||P))")
PS = (0.5, 0.3, 0.2, 0.15, 0.1, 0.07, 0.05, 0.035)
times = {}
for p in PS:
    ts = [detect_time(P, Q, p, 1.0, ALPHA, 120000, rng, GR) for _ in range(40)]
    times[p] = ts
    ok = [t for t in ts if t is not None]
    th = delay_theory(P, Q, p, 1.0, ALPHA, G)
    print(f"p={p:<5} detected {len(ok)}/40 mean delay {sum(ok)/len(ok):8.0f} theory {th:8.0f} ratio {sum(ok)/len(ok)/th:.2f}  small-p law 2L/(p^2 chi2)={2*math.log(G/ALPHA)/(p*p*c2):8.0f}")

print("\nE4. Cheater's best mean undetected savings over N queries (s=1 per cheated query, f=1), best p on the grid")
print("N       best p   savings   sqrt-law   savings/sqrt(N)  (full cheating saves N)")
for N in (250, 1000, 4000, 16000, 64000):
    row = [savings_curve(times[p], p, 1.0, N, 120000) for p in PS]
    b = max(range(len(PS)), key=lambda i: row[i])
    print(f"{N:<8d}{PS[b]:<9}{row[b]:<10.1f}{savings_star(c2, 1.0, ALPHA, G, N):<11.1f}{row[b]/math.sqrt(N):<17.3f}")

N = 1_000_000
print(f"\nE5. Savings ceiling at f=1 (sqrt-law, N={N}) and audit rate needed to cap savings at B, by cheap-model quality")
for b in (0.3, 0.5, 0.7, 0.9):
    cc = chi2(tilt(P, b), P)
    print(f"beta={b}: chi2={cc:.4f} savings at f=1: {savings_star(cc, 1.0, ALPHA, G, N):8.0f}; f needed for B=10000: {audit_rate_for_budget(cc, ALPHA, G, N, 1.0, 10000):8.3f}, B=30000: {audit_rate_for_budget(cc, ALPHA, G, N, 1.0, 30000):8.3f}")

print(f"\nE6. Optimal check rate f* (harm h per unit savings, check cost c per query, N={N}, s=1, beta=0.5)")
for h in (1, 5, 20):
    for c in (0.01, 0.1, 1.0):
        fs = f_star(c2, ALPHA, G, N, 1.0, h, c)
        grid = [i / 2000 for i in range(1, 2001)]
        gb = min(grid, key=lambda f: total_cost(f, c2, ALPHA, G, N, 1.0, h, c))
        print(f"h={h:<4} c={c:<5} f*={fs:.4f} grid-search {gb:.4f} cost(f*)={total_cost(fs, c2, ALPHA, G, N, 1.0, h, c):10.0f} cost(f=1)={total_cost(1.0, c2, ALPHA, G, N, 1.0, h, c):10.0f}")
