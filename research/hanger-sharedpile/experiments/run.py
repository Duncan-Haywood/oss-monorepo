"""Experiments for hanger-sharedpile; writes results.txt (deterministic, seeded). About 1 min, stdlib only."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_sharedpile.shared import (CellParams, PickParams, bottleneck, dryers_served, per_hour_ci,  # noqa: E402
                                      replace, replicate)

REPS = 200
out = []


def say(s=""):
    print(s)
    out.append(s)


CP, PP = CellParams(), PickParams()
SEPS = (0.0, 0.15, 0.30, 0.45, 0.60)

say("== A. Two arms, one pile: clearance between grasps sep (m) vs done/h (load %d, mean of %d loads)" % (CP.load, REPS))
say("policy  sep    done/h   lo     hi   dryers  blocked/load  waited_s/load  bottleneck  u_arms")
for policy in ("pinch", "see", "sweep"):
    for sep in SEPS:
        r = replicate(replace(CP, arms=2), policy, PP, REPS, sep=sep)
        lo, hi = per_hour_ci(r["_runs"])
        say("%-6s %5.2f  %7.1f %5.1f %6.1f  %6.2f  %12.1f  %13.1f  %-10s  %6.2f" % (
            policy, sep, r["done_per_hour"], lo, hi, dryers_served(r["done_per_hour"]), r["blocked"], r["waited"],
            bottleneck(r), r["u_arms"]))

say()
say("== B. Three arms, see policy: does a third arm pay once they block (done/h)")
say("sep   " + "  ".join("arms=%d" % a for a in (1, 2, 3)))
for sep in SEPS:
    row = [replicate(replace(CP, arms=a), "see", PP, REPS, sep=sep)["done_per_hour"] for a in (1, 2, 3)]
    say("%-5.2f " % sep + "  ".join("%6.1f" % x for x in row))

say()
say("== C. Two arms, see, sep 0.30: sensitivity to the downstream time that spaces the arms (s)")
say("downstream  done/h  blocked/load")
for ds in (5.0, 14.0, 30.0, 60.0):
    r = replicate(replace(CP, arms=2), "see", PP, REPS, sep=0.30, downstream=ds)
    say("%10.0f  %6.1f  %12.1f" % (ds, r["done_per_hour"], r["blocked"]))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
