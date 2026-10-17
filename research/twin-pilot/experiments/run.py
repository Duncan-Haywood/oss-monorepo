"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random, statistics as st
from twin_pilot import *

R_COST = 0.05                    # c_T / c_R
RS = rho_star(R_COST)
print(f"== E1  threshold rho*(r) = 2 sqrt(r)/(1+r), and the gain slope at it")
for r in (0.01, 0.05, 0.072, 0.1, 0.172, 0.3):
    rs = rho_star(r)
    chk = (1 - math.sqrt(1 - rs * rs)) ** 2 / (rs * rs)          # equals r if rs is the threshold
    print(f"  r={r:5.3f}: rho*={rs:.4f}  (twin-evaluation threshold at rho*: {chk:.4f})  slope 2sqrt(r)(1+r)/(1-r)={gain_slope(r):.3f}"
          f"  gain at rho=0.8: {gain(0.8, r):.3f}")

print(f"\n== E2  decision only (r={R_COST}, rho*={RS:.4f}): rule 'use the twin iff rho_hat > rho*', oracle allocation once chosen (a twin chosen below rho* is run with its optimal plan, which is worse than real-only)")
print("  misclassification probability and regret in units of the real-only variance; m = pilot pairs; 20000 pilots per cell")
rhos = (0.2, 0.3, 0.4, 0.45, 0.5, 0.6, 0.8)
ms = (10, 20, 40, 80, 160)
print("  P(wrong):      " + "".join(f"m={m:<7d}" for m in ms))
reg = {}
for rho in rhos:
    row, rrow = [], []
    for m in ms:
        rng = random.Random(1000 + int(rho * 100) + m)
        wrong, loss, K = 0, 0.0, 20000
        for _ in range(K):
            use = sample_corr(rho, m, rng) > RS
            best = rho > RS
            if use != best:
                wrong += 1
                loss += abs(1.0 - rel_var_forced(rho, R_COST))
        row.append(wrong / K)
        rrow.append(loss / K)
        reg[(rho, m)] = loss / K
    print(f"  rho={rho:4.2f}     " + "".join(f"{x:<9.3f}" for x in row) + f"   (rho-rho* = {rho - RS:+.3f})")
print("  regret / real-only variance:")
for rho in rhos:
    print(f"  rho={rho:4.2f}     " + "".join(f"{reg[(rho, m)]:<9.4f}" for m in ms))

print("\n  prior-averaged regret, rho ~ U(0.2, 0.8) (density f=1/0.6), by quadrature over rho with 4000 pilots each, vs the law f*slope*(1-rho*^2)^2/(2m)")
grid = [0.2 + 0.6 * (i + 0.5) / 30 for i in range(30)]
for m in ms:
    tot = 0.0
    for i, rho in enumerate(grid):
        rng = random.Random(7000 + 31 * i + m)
        loss = 0.0
        for _ in range(4000):
            if (sample_corr(rho, m, rng) > RS) != (rho > RS):
                loss += abs(1.0 - rel_var_forced(rho, R_COST))
        tot += loss / 4000
    mc = tot / 30
    law = (1 / 0.6) * regret_law(RS, R_COST, m)
    print(f"  m={m:3d}: simulated {mc:.5f}   law {law:.5f}   ratio {mc / law:.2f}")

print(f"\n== E3  plug-in allocation regret, variance(plan for rho_hat)/variance(oracle) - 1 for rho > rho*, C=1000, c_R=1, c_T={R_COST}")
print("  (rho_hat drawn from a pilot of m pairs; ranges with rho_hat <= rho* fall back to real-only and are counted)   20000 pilots per cell")
rhos3 = (0.5, 0.6, 0.7, 0.8, 0.9)
print("  mean regret:   " + "".join(f"m={m:<8d}" for m in ms))
for rho in rhos3:
    vals = []
    for m in ms:
        rng = random.Random(2000 + int(rho * 100) + m)
        tot = 0.0
        for _ in range(20000):
            tot += rel_regret_alloc(sample_corr(rho, m, rng), rho, 1000.0, 1.0, R_COST)
        vals.append(tot / 20000)
    print(f"  rho={rho:3.1f}      " + "".join(f"{v:<10.4f}" for v in vals) + "  m*regret: " + " ".join(f"{v * m:.2f}" for v, m in zip(vals, ms)))
print("  delta-method constant  curvature/2*(1-rho^2)^2  (regret ~ constant/m when rho_hat cannot cross rho*):")
for rho in rhos3:
    print(f"  rho={rho:3.1f}: {0.5 * plan_regret_curvature(rho, R_COST) * (1 - rho * rho) ** 2:.3f}")

print(f"\n== E4  the whole adaptive procedure (pilot m pairs reused, plan from rho_hat, finish budget), C=1000, c_R=1, c_T={R_COST}; sigma_R^2=2, mu=1, twin bias b=+0.7")
print("  twin: noise-free tau=0 (rho=0.707) and noisy tau=1 (rho=0.5), and a weak twin (context share 0.2, rho=0.2)")
MU = 1.0
cases = (("rho=0.707 noise-free", dict(s=1.0, se=1.0, tau=0.0)),
         ("rho=0.5  faithful", dict(s=1.0, se=1.0, tau=1.0)),
         ("rho=0.2  weak twin", dict(s=1.0, se=math.sqrt(4.0), tau=math.sqrt(4.0))))
for name, p in cases:
    sR2 = p["s"] ** 2 + p["se"] ** 2
    sT2 = p["s"] ** 2 + p["tau"] ** 2
    rho = p["s"] ** 2 / math.sqrt(sR2 * sT2)
    n0, N0 = alloc(rho, 1000.0, 1.0, R_COST)
    v_or = var_of_alloc(n0, N0, rho, sR2)
    for m in (10, 20, 40):
        rng = random.Random(3000 + m + int(rho * 100))
        ests, hit, used, K = [], 0, 0, 3000
        ns = []
        for _ in range(K):
            e, (lo, hi), tw, n, N = two_stage(m, 1000.0, 1.0, R_COST, MU, p["s"], p["se"], 0.7, 1.0, p["tau"], rng)
            ests.append(e)
            hit += lo <= MU <= hi
            used += tw
            ns.append(n)
        print(f"  {name:22s} m={m:2d}: bias {st.mean(ests) - MU:+.4f} (se {st.stdev(ests) / math.sqrt(K):.4f})  var/oracle {st.variance(ests) / v_or:.3f}"
              f"  real-only var/oracle {(sR2 / (1000.0 / 1.0)) / v_or:.3f}  coverage {hit / K:.3f}  used twin {used / K:.2f}")
