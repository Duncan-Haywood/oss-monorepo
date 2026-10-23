"""Paired wait-vs-avoid test for hanger-avoid; writes results.txt (deterministic, seeded). Stdlib only, minutes."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_avoidpaired.paired import CellParams, PickParams, paired_stats, per_load, replace  # noqa: E402

REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


CP, PP = replace(CellParams(), arms=2), PickParams()
say("== Paired difference in done/h (avoid - wait) on the same %d loads, load %d, two arms" % (REPS, CP.load))
say("policy  sep   wait   avoid   diff    lo     hi     sd_diff  se_paired  se_unpaired  better_share")
for policy in ("see", "sweep", "pinch"):
    for sep in (0.15, 0.30, 0.45):
        w = per_load(CP, policy, PP, REPS, sep, False)
        a = per_load(CP, policy, PP, REPS, sep, True)
        s = paired_stats(w, a)
        say("%-6s %4.2f %6.1f %6.1f %6.2f %6.2f %6.2f %8.2f %9.3f %11.3f %10.2f" % (
            policy, sep, sum(w) / len(w), sum(a) / len(a), s["mean"], s["lo"], s["hi"], s["sd"],
            s["se_paired"], s["se_unpaired"], s["better"]))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
