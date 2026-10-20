import math, random
from rollout_commons import *

def mean(x): return sum(x) / len(x)

a, c, th = 3.0, 1.0, 0.5
print(f"E1 symmetric swarm, a/c={a/c}, theta={th}: effort and welfare, Nash vs efficient")
for N in (1, 2, 4, 8, 16, 64, 256):
    xn, xe = sym_nash(N, a, c, th), sym_efficient(N, a, c, th)
    wn, we = sym_welfare(N, a, c, th, xn), sym_welfare(N, a, c, th, xe)
    k = 1 + th * (N - 1)
    print(f"  N={N:4d}  total effort Nash {N*xn:7.3f} eff {N*xe:8.2f} (ratio {xe/xn:6.2f})  learning level y Nash {k*xn:.2f} eff {k*xe:.2f}  welfare/agent Nash {wn/N:.3f} eff {we/N:.3f}  eff/Nash {we/wn:.2f}")
print("  limits: Nash total -> (a/c-1)/theta =", (a / c - 1) / th)

print("E2 heterogeneous costs, N=20, a=3, log-cost sigma s (100 draws): contributors, welfare, subsidy")
rng = random.Random(2)
for theta in (0.3, 0.7, 1.0):
    for s in (0.25, 0.5):
        nc, wr, sub, bud = [], [], [], []
        for _ in range(100):
            cs = [math.exp(rng.gauss(0, s)) for _ in range(20)]
            A = [a] * 20
            xn, xe = nash(A, cs, theta), efficient(A, cs, theta)
            wn, we = welfare(xn, A, cs, theta), welfare(xe, A, cs, theta)
            tau = subsidy(xe, A, theta)
            nc.append(sum(v > 1e-9 for v in xn)); wr.append(wn / we)
            sub.append(mean([t / ci for t, ci in zip(tau, cs)])); bud.append(sum(t * x for t, x in zip(tau, xe)) / we)
        print(f"  theta={theta} s={s}: contributors at Nash {mean(nc):5.2f}/20, Nash/efficient welfare {mean(wr):.3f} (min {min(wr):.3f}), mean subsidy/cost {mean(sub):.3f}, subsidy budget / efficient welfare {mean(bud):.3f}")

print("E3 symmetric Pigouvian subsidy tau/c = theta(N-1)/k, a/c=3, theta=0.5")
for N in (2, 4, 8, 32, 128):
    k = 1 + th * (N - 1); xe = sym_efficient(N, a, c, th)
    tau = th * (N - 1) * c / k
    print(f"  N={N:4d}  tau/c {tau/c:.3f}  budget {N*xe*tau:8.2f}  budget/welfare {N*xe*tau/sym_welfare(N,a,c,th,xe):.3f}")

print("E4 audit deterrence p >= (c-eps)/(tau+F), c=1, eps=0.1, tau=0.8 (MC 4e5 draws)")
for F in (0.0, 1.0, 2.0, 5.0):
    p = min_audit_rate(1.0, 0.1, 0.8, F)
    h, j = fraud_payoff_mc(1.0, 0.1, 0.8, F, p, n=400000)
    _, j2 = fraud_payoff_mc(1.0, 0.1, 0.8, F, p / 2, n=400000)
    print(f"  F={F:3.1f}  p*={p:.3f}  honest {h:+.3f}  junk at p* {j:+.3f}  junk at p*/2 {j2:+.3f}")
