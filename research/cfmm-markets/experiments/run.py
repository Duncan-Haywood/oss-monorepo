import sys, os, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from cfmm_markets import *

print("1. Informed-trader profit at equal worst-case loss L = C0 = 1 (LMSR b = 1/ln n): fraction of L extracted")
print("   belief pi                      CFMM 1-n*GM(pi)   LMSR 1-H(pi)/ln n")
for pi in ([.6, .4], [.75, .25], [.9, .1], [.99, .01], [.5, .3, .2], [.8, .1, .1], [.7, .1, .1, .1], [.97, .01, .01, .01]):
    n = len(pi)
    print(f"   {str(pi):28s}  {informed_profit(pi, 1.0):8.4f}          {lmsr_informed_profit(pi, 1 / math.log(n)):8.4f}")

print("\n2. Cost of pushing a binary price to p (L = C0 = 1; LMSR b = 1/ln 2, cost = b ln(1/(2(1-p))))")
print("   p      CFMM cost  shares    LMSR cost  shares")
b = 1 / math.log(2)
for p in (.6, .75, .9, .95, .99, .999):
    print(f"   {p:5.3f}  {binary_cost_to_price(p,1.0):8.3f} {binary_shares_to_price(p,1.0):8.3f}   {b*math.log(1/(2*(1-p))):8.3f} {b*math.log(p/(1-p)):8.3f}")

print("\n3. Laggard price, one leader and n-1 tied laggards at gap G (C0 = 10, LMSR b = C0/ln n): CFMM ~ (C0/G)^n vs LMSR e^{-G/b}")
for n in (2, 4):
    for G in (30, 100, 300, 1000):
        bb = 10 / math.log(n)
        print(f"   n={n} G={G:5d}  CFMM {laggard_price(G, n, 10.0):.3e}  (C0/G)^n={(10/G)**n:.3e}   LMSR {lmsr_prices([0.0]+[-G]*(n-1), bb)[1]:.3e}")

print("\n4. Regret identity  regret = [Q_i - (C(q_T)-C(0))] + sum Bregman  (n=4, T=500, random gains)")
rng = random.Random(0)
for C0 in (2.0, 10.0, 50.0):
    gains = [[rng.random() for _ in range(4)] for _ in range(500)]
    reg, settle, D = regret_decomposition(gains, C0)
    print(f"   C0={C0:5.1f}  regret={reg:8.3f}  settle={settle:6.3f} (<=C0)  sum D={D:8.3f}  check={reg-settle-D:+.1e}")

print("\n5. Routing under a regime switch (n=4, T=2000; expert 0 has mean gain .7 until t=1000, then expert 1; others .5; 100 seeds)")
print("   pseudo-regret vs current best expert's mean; matched worst-case loss (LMSR b = C0/ln 4)")
T, n, seeds = 2000, 4, 100
def env(seed):
    r = random.Random(seed); out = []
    for t in range(T):
        best = 0 if t < T // 2 else 1
        out.append([1.0 if r.random() < (.7 if i == best else .5) else 0.0 for i in range(n)])
    return out
def mus(t):
    best = 0 if t < T // 2 else 1
    return [.7 if i == best else .5 for i in range(n)]
def run(kind, scale, gains):
    q = [0.0] * n; f = router(kind, n, scale); r1 = r2 = 0.0; recov = None
    for t, g in enumerate(gains):
        p = f(q); m = mus(t)
        rr = .7 - sum(pi * mi for pi, mi in zip(p, m))
        if t < T // 2: r1 += rr
        else:
            r2 += rr
            if recov is None and p[1] > .5: recov = t - T // 2
        q = [x + gi for x, gi in zip(q, g)]
    return r1, r2, (T // 2 if recov is None else recov)
print("   C0      | CFMM pre-switch  post-switch  recover(p1>.5) | LMSR pre-switch  post-switch  recover")
for C0 in (2.0, 10.0, 40.0):
    a = [0, 0, 0]; c = [0, 0, 0]
    for s in range(seeds):
        g = env(s); ra = run("cfmm", C0, g); rc = run("lmsr", C0 / math.log(n), g)
        a = [x + y for x, y in zip(a, ra)]; c = [x + y for x, y in zip(c, rc)]
    print(f"   {C0:5.1f}   | {a[0]/seeds:9.1f} {a[1]/seeds:12.1f} {a[2]/seeds:12.1f}    | {c[0]/seeds:9.1f} {c[1]/seeds:12.1f} {c[2]/seeds:9.1f}")
