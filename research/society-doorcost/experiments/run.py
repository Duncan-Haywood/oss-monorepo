"""Seeded experiments for society-doorcost; writes results.txt next to this file."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-doorway" / "src"))
from society_doorcost import cell, threshold_k  # noqa: E402
from society_doorway import costs, simulate  # noqa: E402

out = []


def p(s=""):
    out.append(s)
    print(s)


KS = (0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0)
DS = (0.25, 0.5, 1.0, 2.0, 4.0)
R = 0.3

p(f"== A. dilemma map, robot share {R}, w=1 (mean field, m=9, beta=8)")
p("# k d crowd_best_g cost_all_best cost_all_g0 cost_all_g1 gain_by_going_at_g0 gain_by_going_at_g1 stable_pure dilemma")
for d in DS:
    for k in KS:
        c = cell(R, k, 1.0, d)
        sp = "+".join(f"{g:.0f}" for g in c["stable_pure"]) or "none"
        p(f"{k:.2f} {d:.2f} {c['crowd_g']:.2f} {c['crowd_cost']:.3f} {c['cost_g0']:.3f} {c['cost_g1']:.3f} "
          f"{c['gain_at_g0']:.3f} {c['gain_at_g1']:.3f} {sp} {int(c['dilemma'])}")

p()
p("== B. dilemma map across robot share, d=1, w=1")
p("# share k crowd_best_g stable_pure dilemma")
for r in (0.1, 0.3, 0.5, 0.7):
    for k in KS:
        c = cell(r, k, 1.0, 1.0)
        sp = "+".join(f"{g:.0f}" for g in c["stable_pure"]) or "none"
        p(f"{r:.2f} {k:.2f} {c['crowd_g']:.2f} {sp} {int(c['dilemma'])}")

p()
p("== C. simulation check (n=200, 12 seeds, share 0.3): mean-field vs sim cost for a going and a yielding fleet")
p("# k d g cost_robot_mf cost_robot_sim p_go_people_mf p_go_people_sim")
for k, d in ((1.0, 1.0), (2.0, 1.0), (3.0, 1.0), (3.0, 0.25), (3.0, 4.0), (10.0, 1.0)):
    for g in (0.0, 1.0):
        mf = costs(R, g, k=k, w=1.0, d=d)
        rs = [simulate(R, g, seed=s, k=k, w=1.0, d=d) for s in range(12)]
        sm = {key: sum(x[key] for x in rs) / len(rs) for key in rs[0]}
        p(f"{k:.2f} {d:.2f} {g:.0f} {mf['cost_r']:.3f} {sm['cost_r']:.3f} {mf['p_h']:.3f} {sm['p_h']:.3f}")

p()
p("== D. threshold collision cost k* (w=1): above it a yielding fleet is individually stable (mean field)")
p("# d k_star_share10 k_star_share30 k_star_share50 k_star_over_d_share30")
for d in (0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0):
    ks = [threshold_k(r, d) for r in (0.1, 0.3, 0.5)]
    p(f"{d:.2f} " + " ".join(f"{k:.3f}" for k in ks) + f" {ks[1] / d:.3f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
