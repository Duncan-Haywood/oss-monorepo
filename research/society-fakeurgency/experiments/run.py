"""Seeded experiments for society-fakeurgency; writes results.txt next to this file."""
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-doorway" / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-urgentdoor" / "src"))
from society_fakeurgency import simulate, summary  # noqa: E402
from society_urgentdoor import robot_cost, solve  # noqa: E402

out = []


def p(s=""):
    out.append(s)
    print(s)


R = 0.3
C_GRID = (0.0, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.2)

p("== A. reference: society-urgentdoor, perfect reading, no signalling cost (r=0.3, u=0.2, wu=3, k=3, d=1)")
p("# rule urgent normal robots")
for name, (gU, gN) in (("yield-all", (0, 0)), ("reader", (0, 1))):
    s = solve(R, gU, gN, 0.2, 3.0, 3.0)
    p(f"{name} {s['cU']:.3f} {s['cN']:.3f} {robot_cost(R, gU, gN, 0.2, 3.0, 3.0):.3f}")
p()

p("== B. reader (yield to signallers, go against the rest) as the signal gets costlier, e=0")
p("# c urgent_signals normal_fake precision urgent normal robots crowd")
for c in C_GRID:
    s = summary(R, 0.0, 1.0, c)
    p(f"{c:.1f} {s['sU']:.3f} {s['sN']:.3f} {s['precision']:.3f} {s['cU']:.3f} {s['cN']:.3f} {s['cR']:.3f} {s['crowd']:.3f}")
p()

p("== C. yield-all with the same signal available (nobody gains by signalling): control")
p("# c urgent_signals normal_fake urgent normal robots crowd")
for c in (0.0, 0.3, 1.2):
    s = summary(R, 0.0, 0.0, c)
    p(f"{c:.1f} {s['sU']:.3f} {s['sN']:.3f} {s['cU']:.3f} {s['cN']:.3f} {s['cR']:.3f} {s['crowd']:.3f}")
p()

p("== D. reading error e at c=0.3 (reader fleet)")
p("# e urgent_signals normal_fake urgent normal robots crowd")
for e in (0.0, 0.1, 0.2, 0.3, 0.5):
    s = summary(R, 0.0, 1.0, 0.3, e)
    p(f"{e:.1f} {s['sU']:.3f} {s['sN']:.3f} {s['cU']:.3f} {s['cN']:.3f} {s['cR']:.3f} {s['crowd']:.3f}")
p()

p("== E. does any signal cost make the signal-reader beat yield-all? (c grid x robot share; urgent / crowd, difference from yield-all at the same c)")
p("# robots c d_urgent d_normal d_crowd")
for r in (0.1, 0.3, 0.5):
    for c in C_GRID:
        a, b = summary(r, 0.0, 0.0, c), summary(r, 0.0, 1.0, c)
        p(f"{r:.1f} {c:.1f} {b['cU'] - a['cU']:+.3f} {b['cN'] - a['cN']:+.3f} {b['crowd'] - a['crowd']:+.3f}")
p()

p("== F. the sharpest case: urgent people's waiting cost wu sweep, c=0.3, reader vs yield-all (difference)")
p("# wu urgent_signals normal_fake d_urgent d_normal d_crowd")
for wu in (1.5, 2.0, 3.0, 5.0, 8.0):
    a, b = summary(R, 0.0, 0.0, 0.3, wu=wu), summary(R, 0.0, 1.0, 0.3, wu=wu)
    p(f"{wu:.1f} {b['sU']:.3f} {b['sN']:.3f} {b['cU'] - a['cU']:+.3f} {b['cN'] - a['cN']:+.3f} {b['crowd'] - a['crowd']:+.3f}")
p()

p("== G. agent-based check of the door part (n=400, 500 rounds, 5 seeds), signalling probabilities fixed at the mean-field equilibrium; c=0.3, e=0.1")
p("# group mean_field sim_mean sim_sd")
s = summary(R, 0.0, 1.0, 0.3, 0.1)
D = s["D"]
runs = [simulate(R, 0.0, 1.0, s["sU"], s["sN"], e=0.1, seed=i) for i in range(5)]
mf_door = {"U": s["sU"] * D["U"]["c1"] + (1 - s["sU"]) * D["U"]["c0"],
           "N": s["sN"] * D["N"]["c1"] + (1 - s["sN"]) * D["N"]["c0"]}
for grp, key in (("urgent", "U"), ("normal", "N")):
    vals = [x[key] for x in runs]
    p(f"{grp} {mf_door[key]:.3f} {st.mean(vals):.3f} {st.stdev(vals):.3f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
