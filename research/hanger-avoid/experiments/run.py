"""Experiments for hanger-avoid; writes results.txt (deterministic, seeded). Stdlib only, a few minutes."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_avoid.avoid import CellParams, PickParams, dryers_served, per_hour_ci, replace, replicate  # noqa: E402

REPS = 200
out = []


def say(s=""):
    print(s)
    out.append(s)


CP, PP = CellParams(), PickParams()
SEPS = (0.0, 0.15, 0.30, 0.45)

say("== A. Two arms: wait vs avoid, done/h (95%% bootstrap interval), load %d, mean of %d loads" % (CP.load, REPS))
say("policy  sep   wait  lo  hi   avoid  lo  hi   gain  blocked_wait  blocked_avoid  redirected/load")
for policy in ("pinch", "see", "sweep"):
    for sep in SEPS:
        w = replicate(replace(CP, arms=2), policy, PP, REPS, sep=sep, avoid=False)
        a = replicate(replace(CP, arms=2), policy, PP, REPS, sep=sep, avoid=True)
        wl, wh = per_hour_ci(w["_runs"])
        al, ah = per_hour_ci(a["_runs"])
        say("%-6s %4.2f %6.1f %5.1f %5.1f %6.1f %5.1f %5.1f %6.1f %10.1f %13.1f %15.1f" % (
            policy, sep, w["done_per_hour"], wl, wh, a["done_per_hour"], al, ah,
            a["done_per_hour"] - w["done_per_hour"], w["blocked"], a["blocked"], a["redirected"]))

say()
say("== B. Three arms, see policy: done/h, wait / avoid")
say("sep    wait   avoid")
for sep in SEPS:
    w = replicate(replace(CP, arms=3), "see", PP, REPS, sep=sep, avoid=False)["done_per_hour"]
    a = replicate(replace(CP, arms=3), "see", PP, REPS, sep=sep, avoid=True)["done_per_hour"]
    say("%-5.2f %6.1f %6.1f" % (sep, w, a))

say()
say("== C. Two arms, sep 0.30, see: downstream time that spaces the arms (s), done/h wait / avoid")
say("downstream  wait   avoid")
for ds in (5.0, 14.0, 30.0, 60.0):
    w = replicate(replace(CP, arms=2), "see", PP, REPS, sep=0.30, downstream=ds, avoid=False)["done_per_hour"]
    a = replicate(replace(CP, arms=2), "see", PP, REPS, sep=0.30, downstream=ds, avoid=True)["done_per_hour"]
    say("%10.0f  %6.1f %6.1f" % (ds, w, a))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
