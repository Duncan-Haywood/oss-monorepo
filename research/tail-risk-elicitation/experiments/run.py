"""Deterministic experiments; output in results.txt."""
import math, random
from tail_risk_elicitation import *

al = 0.95

print("E1  ES alone is not elicitable (alpha=0.5): two laws with ES 1.6, their 50/50 mixture has another")
P0 = [(1.6, 1.0)]; P1 = [(0.0, 0.9), (8.0, 0.1)]
M = mixture(P0, P1, 0.5)
print(f"  ES(P0)={var_es(P0, .5)[1]:.4f}  ES(P1)={var_es(P1, .5)[1]:.4f}  ES(mixture)={var_es(M, .5)[1]:.4f}  -> level set not convex (Osband)")

print("\nE2  scale-free penalty for misreporting ES by factor r (VaR truthful): ln r + 1/r - 1")
for r in (0.5, 0.67, 0.8, 0.9, 1.1, 1.25, 1.5, 2.0):
    print(f"  r={r:4.2f}  expected score excess {es_excess_factor(r):.4f}")

print("\nE3  exact excess-score law vs quadrature (Exp(1), alpha=0.95)")
v, e = expo_var_es(al)
n = 100000
atoms = [(-math.log(1 - (i + .5) / n), 1.0 / n) for i in range(n)]
print(f"  VaR {v:.4f} ES {e:.4f}   quadrature c(VaR) {ru(atoms, al, v):.4f}")
for v2f, e2f in ((1.0, 0.8), (1.0, 1.25), (0.7, 1.0), (1.3, 1.0), (1.3, 0.8), (0.6, 1.5)):
    v2, e2 = v * v2f, e * e2f
    ex = excess_score(v2, e2, v, e, expo_ru(al, v2))
    nu = expected_score(atoms, v2, e2, al) - expected_score(atoms, v, e, al)
    print(f"  v x{v2f:.2f} e x{e2f:.2f}  exact {ex:.5f}  quadrature {nu:.5f}")

print("\nE4  quantile-only tolerance undercovers the tail: Pareto(a), alpha=0.99")
print("  a      VaR     ES    ES/VaR=a/(a-1)  E[X-v|X>v]  simulated mean excess over v (n=3e5 tail draws)")
rng = random.Random(7)
for a in (5.0, 3.0, 2.0, 1.5, 1.2):
    v, e = pareto_var_es(a, 0.99)
    # sample tail directly: conditional on X>v, X = v*U^(-1/a)
    tot = 0.0; m = 300000
    for _ in range(m):
        tot += v * (1.0 - rng.random()) ** (-1.0 / a) - v
    print(f"  {a:3.1f}  {v:6.3f} {e:6.3f}   {e/v:6.3f}      {v/(a-1):7.3f}     {tot/m:7.3f}")

print("\nE5  plug-in ES estimation from n scored drift samples (alpha=0.95): relative RMSE, 300 reps (60 at n=6400)")
print("  a=Pareto index; ES infinite for a<=1, Y variance infinite for a<=2")
for a in (4.0, 2.5, 1.5):
    _, e = pareto_var_es(a, al)
    row = []
    for n in (100, 400, 1600, 6400):
        reps = 300 if n <= 1600 else 60
        se = 0.0
        for _ in range(reps):
            xs = [pareto_sample(a, rng) for _ in range(n)]
            se += (es_estimate(xs, al) / e - 1) ** 2
        row.append(f"n={n}: {math.sqrt(se/reps):.3f}")
    print(f"  a={a}  " + "  ".join(row))

print("\nE6  reports needed to catch an understated ES (CLT plan, size 5%, power 80%), Pareto(a), alpha=0.95, honest VaR")
print("  exact Var(Y) from the Pareto moments; r = reported/true ES")
for a in (6.0, 4.0, 3.0):
    v, e = pareto_var_es(a, al); vy = pareto_y_var(a, al)
    print(f"  a={a}  Var(Y)={vy:.3f}  " + "  ".join(f"r={r}: n={detect_n(vy, e, r):8.0f}" for r in (0.5, 0.7, 0.8, 0.9)))

print("\nE7  spread of the mean score gap vs the CLT prediction (infinite for a<=2) (r=0.8, 200 batches)")
def power2(a, n, r, reps):
    v, e = pareto_var_es(a, al)
    m0 = es_excess_factor(r)   # E[S(rE)-S(E)] when the TRUE ES is e
    ds = []
    for _ in range(reps):
        d = 0.0
        for _ in range(n):
            x = pareto_sample(a, rng)
            d += score(v, r * e, x, al) - score(v, e, x, al)
        ds.append(d / n)
    mean = sum(ds) / reps
    sd = math.sqrt(sum((x - mean) ** 2 for x in ds) / reps)
    # the test 'reject the understated report' fires when the avg score difference exceeds m0 - z*sd... report empirical mean vs m0 and spread
    return mean, sd, m0
for a, n in ((4.0, 1000), (3.0, 1000), (2.5, 1000), (1.5, 1000)):
    mean, sd, m0 = power2(a, n, 0.8, 200)
    vy = pareto_y_var(a, al)
    pred = math.sqrt(vy) * abs(1/(0.8*pareto_var_es(a, al)[1]) - 1/pareto_var_es(a, al)[1]) / math.sqrt(n) if vy < math.inf else math.inf
    print(f"  a={a} n={n}  mean score gap {mean:.4f} (exact {m0:.4f})  empirical sd of mean {sd:.4f}  CLT-predicted sd {pred:.4f}")
