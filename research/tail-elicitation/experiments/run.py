import random, math
from tail_elicitation import *

print("== 1. joint minimiser = (VaR, ES); profile score = ln ES")
d = Dist([0.5, 1, 3, 7, 20, 80], [0.3, 0.3, 0.2, 0.12, 0.06, 0.02])
for tau in (0.7, 0.9, 0.97):
    for lam in (0.0, 1.0):
        s, v, e = argmin_expected(d, tau, lam)
        print(f"tau={tau} lam={lam}: argmin=({v:.3f},{e:.3f}) truth=({d.var(tau)},{d.es(tau):.3f}) min score {s:.4f} ln ES {math.log(d.es(tau)):.4f}")

print("\n== 2. ES alone is not elicitable (Osband): level set of ES is not convex")
tau = 0.9; P0 = Dist([0, 10], [.5, .5]); P1 = Dist([0, 20], [.95, .05])
print(f"ES(P0)={P0.es(tau)} ES(P1)={P1.es(tau)} ES(0.5P0+0.5P1)={P0.mix(P1).es(tau)}  (ES is concave in the distribution)")

print("\n== 3. excess score, closed forms (exact on finite d, tau=0.9)")
q, E = d.var(.9), d.es(.9)
for r in (0.5, 0.7, 0.9, 1.1, 1.5):
    print(f"ES x{r}: excess {expected_score(d,q,r*E,.9)-expected_score(d,q,E,.9):.5f} closed {excess_e(r):.5f}")
for v in (1.0, 3.0, 20.0, 80.0):
    print(f"VaR -> {v}: excess {expected_score(d,v,E,.9)-expected_score(d,q,E,.9):.5f} closed {excess_v(d,v,.9):.5f}")

print("\n== 4. detection: forecaster with correct VaR, ES scaled by r. pinball difference is exactly 0.")
print("n needed for paired score diff to reach 2 standard errors (n=4 sd^2/mean^2); 200k sims")
rng = random.Random(7)
for name, sampler, pair in (("lognormal s=1", lambda g: lognormal(g, 1.0), true_pair_lognormal), ("Pareto a=3", lambda g: pareto(g, 3.0), true_pair_pareto)):
    par = 1.0 if "lognormal" in name else 3.0
    for tau in (0.9, 0.95, 0.99):
        v, e = pair(par, tau)
        row = []
        for r in (0.9, 0.7, 0.5):
            mu, sd, n = paired_detection(sampler, tau, v, e, r, 200000, rng)
            row.append(f"r={r}: mean {mu:.4f} (theory {excess_e(r):.4f}) n={n:,.0f}")
        print(f"{name} tau={tau} VaR={v:.2f} ES={e:.2f} | " + " | ".join(row))

print("\n== 5. quantile-part weight lam: cancels exactly when only ES is misreported, matters when VaR is misreported")
print("(lognormal s=1, tau=0.95, common random numbers, 200k sims; forecaster B vs truth A)")
v, e = true_pair_lognormal(1.0, .95)
for label, vb, eb in (("ES x0.7, VaR right", v, 0.7 * e), ("VaR x0.8, ES right", 0.8 * v, e)):
    for lam in (0.0, 0.25, 1.0, 4.0):
        g = random.Random(11); ds = []
        for _ in range(200000):
            y = lognormal(g, 1.0); ds.append(score(vb, eb, y, .95, lam) - score(v, e, y, .95, lam))
        mu = sum(ds) / len(ds); sd = math.sqrt(sum((x - mu) ** 2 for x in ds) / (len(ds) - 1))
        print(f"{label}: lam={lam}: mean {mu:.4f} sd {sd:.4f} n(2se)={4*sd*sd/mu/mu:,.0f}")
