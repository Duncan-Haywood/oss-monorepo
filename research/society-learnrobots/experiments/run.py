"""Seeded experiments for society-learnrobots; writes results.txt next to this file."""
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_learnrobots import qre_fleet, simulate_learning, threshold_k  # noqa: E402
from society_doorway import costs  # noqa: E402

out = []


def p(s=""):
    out.append(s)
    print(s)


R, D, ALPHA = 0.3, 1.0, 0.05
ROUNDS, BURN = 3000, 1500
SEEDS = range(8)
KS = (0.5, 1.0, 1.5, 2.0, 2.8, 4.0, 6.0)


def sim(k, beta_r, g0, r=R, d=D, seeds=SEEDS):
    rs = [simulate_learning(r, k, 1.0, d, beta_r=beta_r, alpha=ALPHA, rounds=ROUNDS, burn=BURN,
                            seed=s, g0=g0) for s in seeds]
    return {key: st.mean(x[key] for x in rs) for key in rs[0]}, st.pstdev([x["g"] for x in rs])


kstar = threshold_k(R, D)
p(f"society-learnrobots: share {R}, d={D}, w=1, people m=9 beta=8; robot step alpha={ALPHA}, "
  f"{ROUNDS} rounds (first {BURN} discarded), n=200, {len(SEEDS)} seeds")
p(f"k* (a fixed always-yield fleet is stable above it, society-doorcost) = {kstar:.3f}")
p()
p("== A. where the fleet settles: logit-QRE prediction vs simulation (start from yielding, g0=0)")
p("# k beta_r qre_g sim_g sim_g_sd sim_people_go cost_all_sim cost_all_always_yield")
for beta_r in (4.0, 16.0):
    for k in KS:
        m, sd = sim(k, beta_r, 0.0)
        c0 = costs(R, 0.0, k=k, d=D)["cost_all"]
        p(f"{k:.2f} {beta_r:.0f} {qre_fleet(R, beta_r, k, 1.0, D):.3f} {m['g']:.3f} {sd:.3f} "
          f"{m['p_h']:.3f} {m['cost_all']:.3f} {c0:.3f}")

p()
p("== B. does the start matter? simulation from yielding (g0=0) and from going (g0=1), beta_r=16")
p("# k sim_g_from_0 sim_g_from_1 qre_g")
for k in KS:
    a, _ = sim(k, 16.0, 0.0)
    b, _ = sim(k, 16.0, 1.0)
    p(f"{k:.2f} {a['g']:.3f} {b['g']:.3f} {qre_fleet(R, 16.0, k, 1.0, D):.3f}")

p()
p("== C. how sharp must the robots be? QRE fleet go share at k=2.8 (about k*) and k=1.5, and the k at")
p("# which it falls below 0.1 (robot share 0.3, d=1)")
p("# beta_r g_at_k1.5 g_at_k2.8 g_at_k4 k_where_g_below_0.1")
for beta_r in (1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0):
    lo, hi = 0.5, 60.0
    if qre_fleet(R, beta_r, hi, 1.0, D) >= 0.1:
        kk = "none"
    else:
        for _ in range(40):
            mid = (lo + hi) / 2
            if qre_fleet(R, beta_r, mid, 1.0, D) >= 0.1:
                lo = mid
            else:
                hi = mid
        kk = f"{(lo + hi) / 2:.2f}"
    p(f"{beta_r:.0f} {qre_fleet(R, beta_r, 1.5, 1.0, D):.3f} {qre_fleet(R, beta_r, 2.8, 1.0, D):.3f} "
      f"{qre_fleet(R, beta_r, 4.0, 1.0, D):.3f} {kk}")

p()
p("== D. robot share, beta_r=16, k=1.5 and k=3, d=1: QRE vs simulation from g0=0")
p("# share k qre_g sim_g")
for r in (0.1, 0.3, 0.5, 0.7):
    for k in (1.5, 3.0):
        m, _ = sim(k, 16.0, 0.0, r=r, seeds=range(4))
        p(f"{r:.2f} {k:.2f} {qre_fleet(r, 16.0, k, 1.0, D):.3f} {m['g']:.3f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
