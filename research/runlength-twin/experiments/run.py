"""Experiments for runlength-twin. Pure Python; output goes to results.txt (~15 s)."""
import math, random
from runlength_twin import *

A, B, Q = 0.9, 1.0, 1.0
EPS = 0.05

def poles(m, r):
    K = riccati_gain(m * A, B, Q, r)
    return K, closed_pole(K, A, B), closed_pole(K, m * A, B)

print("E1  exact relative variance of a run mean vs the definition and simulation (ac = 0.7, rho = 0.49, 20,000 replicates)")
for n in (1, 10, 50, 200):
    sim = simulate_rel_var(0.7, n, 20000, seed=n)
    print(f"    n={n:<4d} exact {rel_var(n,.49):.5f}  double-sum {rel_var_bruteforce(n,.49):.5f}  simulated {sim:.5f}  ratio {sim/rel_var(n,.49):.3f}")

print(f"\nE2  run length for a +-{EPS:.0%} relative half-width at 95% (a=0.9, b=1, q=1); gain = twin's LQR gain, twin pole = m*a")
print("    r     m     K      ac_real  ac_twin  n_twin  n_real  ratio   halfwidth if run n_twin   coverage")
for r in (0.1, 1.0, 5.0):
    for m in (0.5, 0.8, 1.0, 1.5, 2.0, 3.0):
        K, acr, act = poles(m, r)
        if abs(acr) >= 1:
            print(f"    {r:<5} {m:<5} {K:.3f}  unstable")
            continue
        nt, nr = n_exact(EPS, act * act), n_exact(EPS, acr * acr)
        print(f"    {r:<5} {m:<5} {K:.3f}  {acr:7.3f}  {act:7.3f}  {nt:6d}  {nr:6d}  {nr/nt:5.2f}   {halfwidth(nt,acr*acr):8.4f}                {coverage(nt,acr*acr,act*act):.3f}")

print("\nE3  the effect is the closed-loop pole, not the gain: ratio (1+rho_r)(1-rho_t)/((1-rho_r)(1+rho_t)) vs exact ratio, r=1")
for m in (0.5, 1.5, 2.0):
    K, acr, act = poles(m, 1.0)
    print(f"    m={m}: asymptotic {sizing_ratio(acr*acr,act*act):.3f}  exact {n_exact(EPS,acr*acr)/n_exact(EPS,act*act):.3f}")

print("\nE4  sized in the twin: too short when the real loop is slower (m=2, r=0.1; m=0.5, r=5), wastefully long when faster (m=1.5, r=5)")
for m, r in ((2.0, 0.1), (0.5, 5.0), (1.5, 5.0)):
    K, acr, act = poles(m, r)
    if abs(acr) < 1:
        nt = n_exact(EPS, act * act)
        print(f"    m={m} r={r}: n_twin={nt}, real coverage {coverage(nt,acr*acr,act*act):.3f} (nominal 0.950), real half-width {halfwidth(nt,acr*acr):.4f} vs {EPS}")

print("\nE5  simulation check of coverage: run n_twin steps on the real loop, is |mean x^2 / E x^2 - 1| <= eps? (2000 runs)")
for m, r in ((2.0, 0.1), (0.5, 5.0), (1.5, 5.0)):
    K, acr, act = poles(m, r)
    nt = n_exact(EPS, act * act)
    rng = random.Random(7)
    s, hit = math.sqrt(1 - acr * acr), 0
    for _ in range(2000):
        x = rng.gauss(0, 1)
        for _ in range(200):
            x = acr * x + s * rng.gauss(0, 1)
        tot = 0.0
        for _ in range(nt):
            x = acr * x + s * rng.gauss(0, 1)
            tot += x * x
        hit += abs(tot / nt - 1) <= EPS
    print(f"    m={m} r={r}: n_twin={nt}  predicted coverage {coverage(nt,acr*acr,act*act):.3f}  simulated {hit/2000:.3f}")

print("\nE6  repair: size from a real pilot (lag-one autocorrelation of x), r=1, m=2, target eps=0.05")
K, acr, act = poles(2.0, 1.0)
ntrue, nt = n_exact(EPS, acr * acr), n_exact(EPS, act * act)
print(f"    true n_real = {ntrue}, twin-sized n = {nt}")
print("    pilot   median n_hat  10%..90%           P(n_hat < n_real)  P(n_hat < 0.8 n_real)")
for npil in (100, 400, 1600):
    rng = random.Random(11)
    s = math.sqrt(1 - acr * acr)
    ests = []
    for _ in range(600):
        x = rng.gauss(0, 1)
        xs = []
        for _ in range(npil):
            x = acr * x + s * rng.gauss(0, 1)
            xs.append(x)
        ests.append(pilot_size(xs, EPS))
    ests.sort()
    print(f"    {npil:<6d}  {ests[300]:8d}     {ests[60]}..{ests[540]}   {sum(e<ntrue for e in ests)/600:12.2f}      {sum(e<0.8*ntrue for e in ests)/600:12.2f}")
