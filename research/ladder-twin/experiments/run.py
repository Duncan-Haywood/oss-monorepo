"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random, statistics as st
from ladder_twin import *

LC = 1.1                       # failure iff lam < 1.1, i.e. x_T > exp(-1.1)
SM, IN = SmoothQoI(), IndicatorQoI(math.exp(-LC))

print("== E0  ladder: lam ~ U(1,3), x'=-lam x, T=1, twin level l = explicit Euler with n=2^(l+1) fixed steps")
print(f"  smooth QoI E[x_T] = {SM.truth():.6f};  failure P(x_T > e^-{LC}) = P(lam<{LC}) = {IN.truth():.4f}")
print("  l   n     cost   bias(smooth)   V_l(smooth)   bias(fail)    V_l(fail)")
for l in range(0, 11):
    print(f"  {l:<2}  {steps(l):<5} {cost(l):<6} {SM.bias(l):+.3e}   {SM.level_var(l):.3e}   {IN.bias(l):+.3e}  {IN.level_var(l):.3e}")
a_s = fit_rate([abs(SM.bias(l)) for l in range(9, 12)])
b_s = fit_rate([SM.level_var(l) for l in range(9, 12)])
a_f = fit_rate([abs(IN.bias(l)) for l in range(9, 12)])
b_f = fit_rate([IN.level_var(l) for l in range(9, 12)])
print(f"  fitted rates (levels 9-11), x_l ~ 2^(-r l): smooth alpha={a_s:.3f} beta={b_s:.3f};  failure alpha={a_f:.3f} beta={b_f:.3f};  cost gamma=1")

def table(q, eps_list, title):
    print(f"\n== {title}: total twin steps to reach RMSE eps (bias <= eps/sqrt2, variance <= eps^2/2), exact moments")
    print("  eps        L   single-level steps   MLMC steps    saving   N_l (MLMC)")
    for eps in eps_list:
        m = mlmc_cost(q, eps); s = single_level_cost(q, eps)
        print(f"  {eps:<9}  {m[0]:<2}  {s[2]:>18,}   {m[2]:>11,}   {s[2] / m[2]:6.1f}x   {m[1]}")

table(SM, (1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5), "E1  smooth terminal state")
table(IN, (3e-2, 1e-2, 3e-3, 1e-3, 3e-4, 1e-4), "E2  failure indicator")

print("\n== E3  equal budget per level (N_l constant) versus optimal allocation, same variance target")
for q, eps in ((SM, 1e-3), (IN, 1e-3)):
    L, N, tot = mlmc_cost(q, eps)
    V = [q.level_var(l) for l in range(L + 1)]
    n = math.ceil(sum(V) * 2.0 / eps ** 2)
    eq = n * sum(cost(l) for l in range(L + 1))
    print(f"  {q.name:8s} eps={eps}: optimal {tot:,} steps, equal-N_l {eq:,} steps ({eq / tot:.1f}x)")

def sim(q, eps, reps, seed):
    L, N, tot = mlmc_cost(q, eps)
    ls, N1, tot1 = single_level_cost(q, eps)[0], single_level_cost(q, eps)[1], single_level_cost(q, eps)[2]
    rng = random.Random(seed)
    truth = q.truth()
    e_m = [run_mlmc(q, L, N, rng) - truth for _ in range(reps)]
    e_s = [run_single(q, ls, N1, rng) - truth for _ in range(reps)]
    r = lambda e: math.sqrt(sum(x * x for x in e) / len(e))
    print(f"  {q.name:8s} eps={eps}: MLMC   steps {tot:>10,}  RMSE {r(e_m):.2e}  mean err {st.mean(e_m):+.2e}  ({r(e_m) / eps:.2f} eps)")
    print(f"  {'':8s} {'':9}  single steps {tot1:>10,}  RMSE {r(e_s):.2e}  mean err {st.mean(e_s):+.2e}  ({r(e_s) / eps:.2f} eps)")

print("\n== E4  simulation, 200 repetitions each (RMSE should be <= eps by construction; typically ~0.8 eps: bias eps/sqrt2 is a bound)")
sim(SM, 1e-2, 200, 1)
sim(SM, 3e-3, 200, 2)
sim(IN, 3e-2, 200, 3)
sim(IN, 1e-2, 200, 4)

print("\n== E5  the coarse twin alone")
for l in (0, 1, 2, 3, 4):
    print(f"  level {l} (n={steps(l)}): smooth bias {SM.bias(l):+.4f} = {100 * SM.bias(l) / SM.truth():+.1f}% of truth;  failure claim {IN.level_mean(l):.4f} vs real {IN.truth():.4f}")
