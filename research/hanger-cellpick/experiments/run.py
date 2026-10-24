"""Experiments for hanger-cellpick; writes results.txt (deterministic, seeded). About 10 s, stdlib only."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_cellpick.cellpick import (CellParams, PickParams, bottleneck, dryers_served, per_hour_ci,  # noqa: E402
                                      replace, replicate)

REPS = 200
out = []


def say(s=""):
    print(s)
    out.append(s)


CP, PP = CellParams(), PickParams()

say("== A. Pick policy and arms (adjustable hanger, learned rule, load %d, mean of %d loads)" % (CP.load, REPS))
say("policy   arms  done/h   lo    hi   dryers  aside/load  bottleneck  u_arms  u_fold")
for policy in ("assumed", "pinch", "see", "sweep"):
    for arms in (1, 2, 3):
        r = replicate(replace(CP, arms=arms), policy, PP, REPS)
        lo, hi = per_hour_ci(r["_runs"])
        say("%-8s %4d  %7.1f %5.1f %5.1f  %6.2f  %10.2f  %-10s  %6.2f  %6.2f" % (
            policy, arms, r["done_per_hour"], lo, hi, dryers_served(r["done_per_hour"]), r["aside"], bottleneck(r),
            r["u_arms"], r["u_fold"]))

say()
say("== B. One arm, see policy: look time and the chance the pile hides an opening (done/h)")
say("t_see   " + "  ".join("hidden=%.1f" % h for h in (0.0, 0.2, 0.4, 0.6, 0.8)))
for t_see in (0.0, 1.0, 3.0, 6.0):
    row = []
    for h in (0.0, 0.2, 0.4, 0.6, 0.8):
        r = replicate(CP, "see", replace(PP, t_see=t_see, p_hidden=h), REPS)
        row.append("%10.1f" % r["done_per_hour"])
    say("%-6.1f  %s" % (t_see, "  ".join(row)))

say()
say("== C. Two arms: where the limit moves as picking gets faster (see policy, scale on every pick time)")
say("scale  done/h  dryers  bottleneck  u_arms  u_fold")
for k in (2.0, 1.0, 0.5, 0.25):
    pp = replace(PP, t_see=PP.t_see * k, t_grasp=PP.t_grasp * k, t_regrasp=PP.t_regrasp * k,
                 t_sweep=PP.t_sweep * k, t_drop=PP.t_drop * k)
    r = replicate(replace(CP, arms=2), "see", pp, REPS)
    say("%5.2f  %7.1f  %6.2f  %-10s  %6.2f  %6.2f" % (k, r["done_per_hour"], dryers_served(r["done_per_hour"]), bottleneck(r),
                                                    r["u_arms"], r["u_fold"]))

say()
say("== D. Cost of the policy in items left for a person (one arm, per 100 items)")
say("policy   aside/100  pick_s_per_item")
for policy in ("assumed", "pinch", "see", "sweep"):
    r = replicate(CP, policy, PP, REPS)
    say("%-8s %9.1f  %15.1f" % (policy, 100 * r["aside"] / CP.load, r["arm_s_per_item"]))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
