"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random, statistics as st
from scenario_twin import *

V, GAP, MU0, SIG = 15.0, 35.0, 0.7, 0.25
A = braking_threshold(V, GAP, MU0, SIG)
P = Q(A)

print("== E0  worked scenario: brake from 15 m/s, obstacle 35 m ahead, friction mu = 0.7 exp(-0.25 x), x ~ N(0,1) (real)")
print(f"  failure iff x > a = {A:.4f};  real P = Q(a) = {P:.3e};  plain Monte Carlo needs {n_required(A, 1.0, 0.1):.0f} runs for 10% standard error")
mu_c = MU0 * math.exp(-SIG * A)
print(f"  critical friction {mu_c:.4f}; stepped twin (dt=1 ms) stopping distance at it: {simulate_stopping_distance(V, mu_c, 1e-3):.3f} m (gap {GAP} m)")

print(f"\n== E1  twin scenario width s (real = 1), a = {A:.3f}: unweighted twin claim, real P, and reweighted cost")
print("  s      claim Q(a/s)   P/claim        rel.var/sample   runs for 10% s.e.")
for s in (0.5, 0.6, 0.7, 0.75, 0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 3.25, 4.0):
    c = naive_claim(A, s)
    rv = rel_var(A, s)
    rvs = "infinite" if math.isinf(rv) else f"{rv:10.1f}"
    ns = "infinite" if math.isinf(rv) else f"{n_required(A, s, 0.1):10.0f}"
    print(f"  {s:<5}  {c:10.3e}   {P / c:10.3g}   {rvs:>14}   {ns:>10}")

print("\n== E2  optimal width s* and the saving over plain Monte Carlo (s=1), by real failure probability")
print("  a      P            s*      s*/a    rel.var(s*)   rel.var(1)     saving")
for a in (2.0, 3.0, 3.0902, 4.0, 5.0, 6.0):
    s = optimal_width(a)
    print(f"  {a:<5}  {Q(a):.3e}   {s:.3f}   {s / a:.3f}   {rel_var(a, s):9.2f}   {rel_var(a, 1.0):12.1f}   {rel_var(a, 1.0) / rel_var(a, s):9.1f}x")

print(f"\n== E3  simulation: n=2000 twin runs, a={A:.3f}, 4000 repetitions; Wald 95% interval on the reweighted estimate")
print("  s      mean/P    sd/P (sim)  sd/P (law)   zero-failure runs   coverage   median ESS")
N, REPS = 2000, 4000
for s in (0.6, 0.8, 1.0, 1.5, 2.0, 3.25):
    rng = random.Random(100 + int(s * 100))
    ests, cover, zero, ess = [], 0, 0, []
    for _ in range(REPS):
        v = sample_is(N, A, s, rng)
        m, se, (lo, hi) = estimate(v)
        ests.append(m)
        zero += (m == 0.0)
        cover += (lo <= P <= hi)
        sw = sum(v); sw2 = sum(x * x for x in v)
        ess.append(sw * sw / sw2 if sw2 > 0 else 0.0)
    law = math.sqrt(rel_var(A, s) / N) if math.isfinite(rel_var(A, s)) else math.inf
    print(f"  {s:<5}  {st.mean(ests) / P:6.3f}   {st.pstdev(ests) / P:9.3f}   {law:9.3f}   {zero / REPS:14.3f}   {cover / REPS:14.3f}   {st.median(ess):8.1f}")

print(f"\n== E4  repair: defensive mixture q = (1-lam) N(0,s^2) + lam N(0,1) with a too-narrow twin s=0.6 (a={A:.3f})")
print("  lam    exact rel.var   bound 1/(lam P)-1   runs for 10% s.e.   sim coverage (n=2000)   zero runs")
for lam in (0.05, 0.1, 0.2, 0.5):
    rv = mixture_rel_var(A, 0.6, lam)
    rng = random.Random(500 + int(lam * 100))
    cover = zero = 0
    for _ in range(2000):
        m, se, (lo, hi) = estimate(sample_is(N, A, 0.6, rng, lam))
        cover += (lo <= P <= hi); zero += (m == 0.0)
    print(f"  {lam:<5}  {rv:12.1f}   {1 / (lam * P) - 1:16.1f}   {rv / 0.01:16.0f}   {cover / 2000:16.3f}   {zero / 2000:12.3f}")
print(f"  (plain Monte Carlo on the real prior: rel.var {rel_var(A, 1.0):.1f}, {n_required(A, 1.0, 0.1):.0f} runs)")
for lam in (0.2,):
    rv = mixture_rel_var(A, 3.25, lam)
    print(f"  wide twin s=3.25 with lam={lam}: rel.var {rv:.1f} (pure s=3.25: {rel_var(A, 3.25):.1f})")
