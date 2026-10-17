"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random, statistics as st
from twin_ladder import *
from twin_ladder.plant import *

print("== E1  a cheaper rung pays iff rho2/rho1 > rho*(c2/c1)  (exact variance formula; grid check)")
agree = tot = infeas = npay = 0
for rho1 in (0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99):
    for x in [i / 40 for i in range(4, 40)]:
        for r in (0.01, 0.03, 0.1, 0.25, 0.5, 0.75):
            if abs(x - rho_star(r)) < 1e-9:
                continue
            g = rung_gain(rho1, rho1 * x, 0.2, 0.2 * r)
            tot += 1
            agree += (g < 0) == rung_pays(rho1, rho1 * x, 0.2, 0.2 * r)
            if rho1 > rho_star(0.2) and rung_pays(rho1, rho1 * x, 0.2, 0.2 * r) and not feasible([1, rho1, rho1 * x], [1.0, 0.2, 0.2 * r]):
                infeas += 1
            if rho1 > rho_star(0.2) and rung_pays(rho1, rho1 * x, 0.2, 0.2 * r):
                npay += 1
print(f"  {agree}/{tot} grid points: sign of the variance change equals the condition; of the {npay} paying rungs below a twin that itself pays (c1=0.2), {infeas} make the ladder infeasible (twin 1 is then sampled less than the real system, i.e. redundant)")
print("  rho*(r): " + "  ".join(f"r={r}:{rho_star(r):.3f}" for r in (0.01, 0.05, 0.1, 0.25, 0.5, 0.75)))
print("  example rho1=0.9, rho2=0.8 (x=0.889):  " + "  ".join(f"r={r}: {rung_gain(0.9, 0.8, 0.2, 0.2 * r):+.3f}" for r in (0.05, 0.25, 0.5, 0.75)))

print("\n== E2  exact variance of the nested estimator vs simulation (Gaussian chain, twin biases +0.7, +1.5; alpha_i = rho_i; 6000 replications)")
mus = [1.0, 1.7, 2.5]
for rhos, costs, C in (([0.9, 0.8], [1, 0.1, 0.02], 80.0), ([0.95, 0.9], [1, 0.2, 0.04], 60.0), ([0.7, 0.6], [1, 0.05, 0.005], 60.0)):
    real = ladder_alloc([1] + rhos, costs, C)
    ms = [max(1, round(x)) for x in real]
    rng = random.Random(int(sum(rhos) * 1000) + int(C))
    est = [mfmc_estimate(sample_chain(ms[-1], mus, rhos, rng), ms, rhos) for _ in range(6000)]
    v_th = int_var([1] + rhos, ms)
    print(f"  rho={rhos} c={costs} C={C:g}: m={ms}  mean {st.mean(est):+.4f} (se {st.pstdev(est)/math.sqrt(6000):.4f}, truth 1)  var sim {st.pvariance(est):.5f}"
          f"  exact {v_th:.5f}  ratio {st.pvariance(est)/v_th:.3f}   real-only {1/(C/costs[0]):.5f}  continuous optimum {ladder_var([1]+rhos, costs, C):.5f}  feasible={feasible([1]+rhos, costs)}")

print("\n== E3  geometric ladder: K extra rungs, each costing r times the one above and having step correlation q with it (Markov chain)")
print("  variance relative to real-only at equal cost, best feasible subset of K rungs in brackets")
for q, r in ((0.99, 0.5), (0.95, 0.5), (0.90, 0.5), (0.98, 0.25), (0.90, 0.25), (0.80, 0.1), (0.60, 0.1)):
    row = []
    for K in (1, 2, 3, 4, 6):
        rho = chain_rhos([q] * K)
        costs = [1.0] + [r ** (j + 1) for j in range(K)]
        v_all = ladder_var([1.0] + rho, costs)
        v_best, sub = best_ladder([(rho[j], costs[j + 1]) for j in range(K)], 1.0)
        row.append(f"K={K}: {v_all:.3f} [{v_best:.3f}; {len(sub)} rungs]{'' if feasible([1.0]+rho, costs) else ' (all-rungs infeasible)'}")
    print(f"  q={q} r={r} (rho*={rho_star(r):.3f}, pays={'yes' if q > rho_star(r) else 'no'}):  " + "   ".join(row))

# --- E4: timestep ladder of a saturated PD-controlled mass-spring ----------------------------------------------------------------
print("\n== E4  timestep ladder (semi-implicit Euler, step = 1,2,4,8,16 x 1/160 s; level 0 = 'real'), horizon 4 s, return = int x^2+0.05u^2")
print("  cost = steps per episode (640/320/160/80/40).  Disturbance replay s: the twin sees sqrt(s) of the real disturbance plus sqrt(1-s) independent noise.")
NP, NREP, CBUD = 4000, 3000, 200 * 640.0
for s_share in (1.0, 0.9, 0.7):
    rng = random.Random(77)
    pool = []
    for _ in range(NP):
        ctx = make_context(rng)
        row = [episode_cost_return(ctx, 0)[1]]
        for lv in range(1, NLEVELS):
            if s_share >= 1.0:
                row.append(episode_cost_return(ctx, lv)[1])
            else:
                w2 = make_noise(rng)
                mix = [math.sqrt(s_share) * a + math.sqrt(1 - s_share) * b for a, b in zip(ctx[2], w2)]
                row.append(episode_cost_return(ctx, lv, own_noise=mix)[1])
        pool.append(row)
    K = NLEVELS - 1
    cols = [[r[j] for r in pool] for j in range(K + 1)]
    mean = [st.mean(c) for c in cols]
    sd = [st.pstdev(c) for c in cols]
    rho = []
    for j in range(1, K + 1):
        cv = sum((a - mean[0]) * (b - mean[j]) for a, b in zip(cols[0], cols[j])) / NP
        rho.append(cv / (sd[0] * sd[j]))
    costs = [640.0 / LEVEL_STEPS[j] for j in range(K + 1)]
    print(f"\n  -- replay share s={s_share}:  pool of {NP} contexts")
    print("     level  step   cost   mean R     rho with real   step-corr rho_j/rho_(j-1)  rho*(c_j/c_(j-1))")
    for j in range(1, K + 1):
        prev = 1.0 if j == 1 else rho[j - 2]
        print(f"     {j}      {LEVEL_STEPS[j]:>2}/160  {costs[j]:5.0f}  {mean[j]:7.3f}   {rho[j-1]:+.4f}        {rho[j-1]/prev:.4f}                     {rho_star(costs[j]/costs[j-1]):.4f}")
    print(f"     real: mean {mean[0]:.3f}, sd {sd[0]:.3f}")
    twins = [(rho[j], costs[j + 1]) for j in range(K)]
    v_real = 1.0 * costs[0] / CBUD
    v_best, sub = best_ladder(twins, costs[0], CBUD)
    single = min(((ladder_var([1.0, twins[i][0]], [costs[0], twins[i][1]], CBUD), i) for i in range(K) if twins[i][0] < 1), default=None)
    print(f"     budget = {CBUD:.0f} steps (= {CBUD/costs[0]:.0f} real episodes).  variance / real-only: best single twin {single[0]/v_real:.4f} (level {single[1]+1}); best ladder {v_best/v_real:.4f} with levels {[i+1 for i in sub]}")
    strategies = {"real only": None, "best single twin": (single[1],), "best ladder": sub}
    for name, sel in strategies.items():
        if sel is None:
            ms, idx = [int(CBUD / costs[0])], [0]
        else:
            sel = tuple(sorted(sel, key=lambda i: -twins[i][0]))
            idx = [0] + [i + 1 for i in sel]
            ms = ladder_alloc([1.0] + [twins[i][0] for i in sel], [costs[i] for i in idx], CBUD)
            ms = [max(1, round(x)) for x in ms]
            ms = [max(ms[:i + 1]) for i in range(len(ms))]
        alphas = [rho[i - 1] * sd[0] / sd[i] for i in idx[1:]]
        r2 = random.Random(5)
        est = []
        for _ in range(NREP):
            draw = [pool[r2.randrange(NP)] for _ in range(ms[-1])]
            rows = [[d[i] for i in idx] for d in draw]
            est.append(mfmc_estimate(rows, ms, alphas))
        truth = mean[0]
        rhos_sel = [1.0] + [rho[i - 1] for i in idx[1:]]
        pred = int_var(rhos_sel, ms) * sd[0] ** 2 if len(ms) > 1 else sd[0] ** 2 / ms[0]
        spent = sum(m * costs[i] for m, i in zip(ms, idx))
        print(f"     {name:17s} m={ms} spent {spent:.0f}  mean {st.mean(est):.4f} (truth {truth:.4f}, se {st.pstdev(est)/math.sqrt(NREP):.4f})  var {st.pvariance(est):.5f}  exact {pred:.5f}  sim/exact {st.pvariance(est)/pred:.3f}"
              f"  var/real-only {st.pvariance(est)/(sd[0]**2/(CBUD/costs[0])):.4f}")

print("\n== E5  the next rung (step 32/160 = 0.2 s) on the same contexts: numerically unstable")
rng = random.Random(9)
bad, tot, worst = 0, 20000, 0.0
vals = []
for _ in range(tot):
    ctx = make_context(rng)
    try:
        R5 = episode_cost_return(ctx, 5)[1]
    except OverflowError:
        R5 = float("inf")
    vals.append(R5)
    if R5 > 1e3:
        bad += 1
    worst = max(worst, R5)
print(f"  {bad}/{tot} contexts with R > 1e3 (real-level mean is ~17; the earlier 600-context probe had one blow-up that gave a mean of 5e48); largest R = {worst:.3g}; median R = {st.median(vals):.3f}")
