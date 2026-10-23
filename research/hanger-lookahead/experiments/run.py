"""Lookahead vs current-pick-only avoidance on the same loads; writes results.txt (seeded). Stdlib only, minutes."""
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "hanger-avoidpaired" / "src"))
from hanger_avoidpaired.paired import paired_stats  # noqa: E402
from hanger_lookahead.look import CellParams, PickParams, per_load, replace  # noqa: E402

REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


CP, PP = replace(CellParams(), arms=2), PickParams()
say("== Paired difference in done/h (lookahead - avoid current pick) on the same %d loads, load %d, two arms" % (REPS, CP.load))
say("policy  sep  window  avoid   look    diff    lo     hi     sd_diff  redirects_per_load  better_share")
for policy in ("see", "sweep", "pinch"):
    for sep in (0.15, 0.30, 0.45):
        a, _ = per_load(CP, policy, PP, REPS, sep, False)
        for window in (15.0, 1e9):
            b, reds = per_load(CP, policy, PP, REPS, sep, True, window)
            s = paired_stats(a, b)
            say("%-6s %4.2f %6s %6.1f %6.1f %6.2f %6.2f %6.2f %8.2f %12.2f %14.2f" % (
                policy, sep, "inf" if window > 1e8 else "%g" % window, statistics.fmean(a), statistics.fmean(b),
                s["mean"], s["lo"], s["hi"], s["sd"], statistics.fmean(reds), s["better"]))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
