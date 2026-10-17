"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from explanation_twin import *

rng = random.Random(11)
print("Planner picks the argmin of the sample-mean cost of n twin rollouts per plan and quotes that simulated cost.")
print("Gaussian sample means (sd s = sigma/sqrt(n)); quadrature is exact, Monte-Carlo uses 100,000 repeats.")

print("\n== 1. Equal true costs: quoted cost is optimistic by exactly e_K * s (winner's curse) ==")
print("K   e_K      quadrature (quoted-true)/s   Monte-Carlo (sigma=sqrt10,n=10, so s=1)")
for K in (2, 3, 5, 10, 20):
    _, eq, et = pick_and_quote([0.0] * K, 1.0)
    r = simulate_select([0.0] * K, math.sqrt(10), 10, 100000, rng)
    print("%-3d %.4f   %.4f                     %.4f" % (K, emax(K), (eq - et), r["bias"]))

print("\n== 2. Two plans, true gap d (units of s): optimism of the quoted cost and of the quoted gap ==")
print("d/s   quoted-cost bias/s (closed form)   quoted gap / d   (quoted gap is E|X1-X2|)")
for d in (0.0, 0.5, 1.0, 2.0, 3.0, 5.0):
    g = gap_quote_mean(d, 1.0)
    print("%-5g %.4f                             %s" % (d, k2_quote_bias(d, 1.0), "%.3f (quoted %.3f vs true gap %g)" % (g / d, g, d) if d else "quoted %.3f vs true gap 0" % g))

print("\n== 3. Linearly spaced plans mu_k = 0.25 k s0 (K=5, sigma=1): how the bias falls with rollouts n ==")
mus = [0.25 * k for k in range(5)]
print("n     s      P(pick best)   quoted-true bias   regret")
for n in (2, 5, 10, 20, 50, 100, 400):
    s = 1.0 / math.sqrt(n)
    pk, eq, et = pick_and_quote(mus, s)
    print("%-5d %.3f  %.3f          %+.4f            %.4f" % (n, s, pk[0], eq - et, et - mus[0]))

print("\n== 4. Coverage of quoted +/- 1.96 se for the picked plan's true cost (equal means, n=10, sigma=1) ==")
print("K    naive (selection data)   fresh rollouts")
for K in (1, 2, 5, 10, 20):
    cn, cf = coverage_naive_fresh([0.0] * K, 1.0, 10, 100000, rng)
    print("%-4d %.3f                    %.3f" % (K, cn, cf))

print("\n== 5. Split-sample repair: total n=20 rollouts per plan, n1 select / n-n1 report (K=5, mu_k=0.25k, sigma=1) ==")
print("n1   bias       regret   P(best)")
for n1 in (20, 16, 12, 10, 8, 4):
    r = simulate_select(mus, 1.0, 20, 100000, rng, n1=n1)
    print("%-4d %+.4f   %.4f   %.3f" % (n1, r["bias"], r["regret"], r["hit"]))

print("\n== 6. Twin model error b_k ~ N(0,tau^2) per plan (fixed; rollouts cannot shrink it): equal real costs, K=5 ==")
print("Fresh-report bias = -e_K tau^2/sqrt(tau^2+s1^2) with s1 = sigma/sqrt(n1); n=40 total, n1=20, sigma=1 (s1=0.224)")
print("tau    formula     Monte-Carlo (fresh)   naive (n1=n=40)   naive at n->many (s->0, tau only)")
for tau in (0.1, 0.25, 0.5, 1.0):
    f = model_error_bias(5, tau, 1.0 / math.sqrt(20))
    r = simulate_select([0.0] * 5, 1.0, 40, 100000, rng, n1=20, tau=tau)
    rn = simulate_select([0.0] * 5, 1.0, 40, 100000, rng, tau=tau)
    print("%-6g %+.4f    %+.4f               %+.4f           %+.4f" % (tau, f, r["bias"], rn["bias"], -emax(5) * tau))

print("\n== 7. Non-Gaussian rollouts: cost = sum of 4 lognormal segment delays (sigma_ln=0.8), K=5 equal-mean plans, n=10 ==")
seg_ln = 0.8
m_seg = 1.0
def rollout():
    return sum(m_seg * math.exp(seg_ln * rng.gauss(0, 1) - seg_ln ** 2 / 2) for _ in range(4))
sd = math.sqrt(4 * (math.exp(seg_ln ** 2) - 1))
n, K, reps = 10, 5, 20000
b = 0.0
for _ in range(reps):
    means = [sum(rollout() for _ in range(n)) / n for _ in range(K)]
    b += min(means) - 4.0
pred, got = -emax(K) * sd / math.sqrt(n), b / reps
print("true mean 4.0, rollout sd %.3f, s=%.3f; Gaussian prediction bias %.4f; simulated bias %.4f (Gaussian formula overstates it by %.0f%%; rollouts are right-skewed)" % (sd, sd / math.sqrt(n), pred, got, (pred / got - 1) * 100))
