"""Seeded experiments for society-urgentdoor; writes results.txt next to this file."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-doorway" / "src"))
from society_urgentdoor import (best_policy, crowd_cost, deviation_gains, robot_cost, simulate,  # noqa: E402
                                solve, stable)

out = []


def p(s=""):
    out.append(s)
    print(s)


POLICIES = {"yield-all": (0.0, 0.0), "reader": (0.0, 1.0), "reader-half": (0.0, 0.5),
            "go-all": (1.0, 1.0), "reverse": (1.0, 0.0)}
R, U, WU = 0.3, 0.2, 3.0

for k in (1.5, 3.0, 5.0):
    p(f"== A. fleet rules, robots {R}, urgent share of people {U}, urgent waiting cost x{WU:g}, k={k:g}, d=1 (mean field)")
    p("# policy gU gN urgent_cost normal_cost robot_cost crowd_cost stable")
    for name, (gU, gN) in POLICIES.items():
        s = solve(R, gU, gN, U, WU, k)
        p(f"{name} {gU:.1f} {gN:.1f} {s['cU']:.3f} {s['cN']:.3f} {robot_cost(R, gU, gN, U, WU, k):.3f} "
          f"{crowd_cost(R, gU, gN, u=U, wu=WU, k=k):.3f} {int(stable(R, gU, gN, u=U, wu=WU, k=k))}")
    for obj in ("crowd", "people", "urgent"):
        gU, gN = best_policy(R, obj, u=U, wu=WU, k=k)
        p(f"best-for-{obj} {gU:.1f} {gN:.1f} stable={int(stable(R, gU, gN, u=U, wu=WU, k=k))}")
    p()

p("== B. how much urgency is needed: reader vs yield-all, k=3, robots 0.3 (change in cost, reader minus yield-all)")
p("# wu urgent_share d_urgent d_normal d_robot d_crowd")
for wu in (1.0, 1.5, 2.0, 3.0, 5.0):
    for u in (0.1, 0.2, 0.4):
        a = solve(R, 0, 0, u, wu, 3.0)
        b = solve(R, 0, 1, u, wu, 3.0)
        dr = robot_cost(R, 0, 1, u, wu, 3.0) - robot_cost(R, 0, 0, u, wu, 3.0)
        dc = crowd_cost(R, 0, 1, u=u, wu=wu, k=3.0) - crowd_cost(R, 0, 0, u=u, wu=wu, k=3.0)
        p(f"{wu:.1f} {u:.1f} {b['cU'] - a['cU']:+.3f} {b['cN'] - a['cN']:+.3f} {dr:+.3f} {dc:+.3f}")
p()

p("== C. deviation gains of one robot in the reader fleet (positive: going pays), k=3, wu=3, u=0.2")
p("# robots gain_vs_urgent gain_vs_normal stable")
for r in (0.1, 0.3, 0.5, 0.7):
    gu, gn = deviation_gains(r, 0, 1, u=U, wu=WU, k=3.0)
    p(f"{r:.1f} {gu:+.3f} {gn:+.3f} {int(stable(r, 0, 1, u=U, wu=WU, k=3.0))}")
p()

p("== D. agent-based check (n=400, 500 rounds, 150 burn-in, 5 seeds), k=3, robots 0.3, urgent 0.2, wu=3")
p("# policy group mean_field sim_mean sim_sd")
import statistics as st
for name in ("yield-all", "reader", "go-all"):
    gU, gN = POLICIES[name]
    mf = solve(R, gU, gN, U, WU, 3.0)
    runs = [simulate(R, gU, gN, U, WU, seed=s) for s in range(5)]
    for grp, key in (("urgent", "U"), ("normal", "N"), ("robot", "R")):
        vals = [x[key] for x in runs]
        mfv = mf["cU"] if key == "U" else mf["cN"] if key == "N" else robot_cost(R, gU, gN, U, WU, 3.0)
        p(f"{name} {grp} {mfv:.3f} {st.mean(vals):.3f} {st.stdev(vals):.3f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
