"""Seeded experiments for society-doorway; writes results.txt next to this file."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_doorway import costs, equilibrium, simulate  # noqa: E402

SEEDS = range(12)
out = []


def p(s=""):
    out.append(s)
    print(s)


def sim(r, g, **kw):
    rs = [simulate(r, g, seed=s, **kw) for s in SEEDS]
    return {k: sum(x[k] for x in rs) / len(rs) for k in rs[0]}


p("== A. mean field vs simulation (n=200, m=9, beta=8, 12 seeds)")
p("# share_robots robot_go  p_go_people_mf p_go_people_sim  cost_people_mf cost_people_sim  cost_robot_mf cost_robot_sim")
for r, g in ((0.0, 0.0), (0.2, 0.0), (0.5, 0.0), (0.2, 1.0), (0.5, 1.0), (0.3, 0.33)):
    mf, sm = costs(r, g), sim(r, g)
    p(f"{r:.2f} {g:.2f} {mf['p_h']:.3f} {sm['p_h']:.3f} {mf['cost_h']:.3f} {sm['cost_h']:.3f} {mf['cost_r']:.3f} {sm['cost_r']:.3f}")

p()
for g in (0.0, 1.0):
    p(f"== B{int(g)}. mean field, robot share sweep, robots {'always go' if g else 'always yield'} (g={g:.0f})")
    p("# share  g  p_go_people  cost_people  cost_robot  cost_all")
    for r in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        c = costs(r, g)
        p(f"{r:.2f} {g:.0f} {c['p_h']:.3f} {c['cost_h']:.3f} {c['cost_r']:.3f} {c['cost_all']:.3f}")
    p()

p()
p("== C. mean field, best fixed robot go probability for the crowd's total cost")
p("# share  best_g  cost_all_best  cost_all_g0  cost_all_g1  cost_people_best")
for r in (0.1, 0.2, 0.3, 0.5, 0.7):
    gs = [i / 50 for i in range(51)]
    best = min(gs, key=lambda g: costs(r, g)["cost_all"])
    cb = costs(r, best)
    p(f"{r:.2f} {best:.2f} {cb['cost_all']:.3f} {costs(r, 0.0)['cost_all']:.3f} {costs(r, 1.0)['cost_all']:.3f} {cb['cost_h']:.3f}")

p()
p("== D. dilemma: fleet at share 0.3 plays g_fleet; one robot (negligible share) plays g_dev")
p("# g_fleet  cost_fleet_robot(g=g_fleet)  cost_deviator_g0  cost_deviator_g1  cost_person")
for gf in (0.0, 0.33, 1.0):
    q, ph = equilibrium(0.3, gf)
    cf = gf * 3 * q + (1 - gf) * (q + (1 - q))
    cy = q + (1 - q)
    cg = 3 * q
    ch = costs(0.3, gf)["cost_h"]
    p(f"{gf:.2f} {cf:.3f} {cy:.3f} {cg:.3f} {ch:.3f}")

p()
p("== E. memory and sharpness: people's go probability with 30% always-yield robots (mean field)")
p("# m beta p_go_people_r0 p_go_people_r30 shift")
for m in (3, 9, 25):
    for beta in (2.0, 8.0, 20.0):
        a, b = equilibrium(0.0, 0.0, m, beta)[1], equilibrium(0.3, 0.0, m, beta)[1]
        p(f"{m} {beta:.0f} {a:.3f} {b:.3f} {b - a:+.3f}")

open(HERE / "results.txt", "w").write("\n".join(out) + "\n")
