"""All experiments for hanger-pick; writes results.txt (deterministic, seeded).

python3 experiments/run.py      under a minute, stdlib only
"""
import statistics
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
sys.path.insert(0, str(HERE.parents[1] / "hanger-cell" / "src"))
from hanger_pick.pile import Params, unload  # noqa: E402

REPS = 300
POLICIES = ("pinch", "see", "sweep")
out = []


def say(s=""):
    print(s)
    out.append(s)


def mean(n, policy, p, key):
    return statistics.fmean(unload(n, policy, p, s)[key] for s in range(REPS))


BASE = Params()

say("== A. Seconds per garment to empty a pile of n garments, by policy (mean of %d piles; assumed times)" % REPS)
say("n   %s   visible0  %s" % ("  ".join("%7s" % p for p in POLICIES), "  ".join("direct_" + p for p in POLICIES[1:])))
for n in (4, 8, 12, 18, 25, 35):
    t = [mean(n, pol, BASE, "per_item") for pol in POLICIES]
    d = [mean(n, pol, BASE, "direct") for pol in POLICIES[1:]]
    say("%-3d %s   %8.2f  %s" % (n, "  ".join("%7.2f" % x for x in t), mean(n, "pinch", BASE, "vis0"),
                                 "  ".join("%11.2f" % x for x in d)))

say()
say("== B. Seconds per garment (n = 18) against q, the chance one regrasp finds the opening (pinch is the policy that pays it)")
say("q     %s   best" % "  ".join("%7s" % p for p in POLICIES))
for q in (0.15, 0.25, 0.35, 0.5, 0.7, 0.9):
    p = replace(BASE, q_find=q)
    t = [mean(18, pol, p, "per_item") for pol in POLICIES]
    say("%-5.2f %s   %s" % (q, "  ".join("%7.2f" % x for x in t), POLICIES[t.index(min(t))]))

say()
say("== C. Seconds per garment (n = 18) against theta, the visible fraction needed to aim at an opening")
say("theta %s" % "  ".join("%7s" % p for p in POLICIES[1:]))
for th in (0.2, 0.35, 0.5, 0.65, 0.8, 0.95):
    p = replace(BASE, theta=th)
    say("%-5.2f %s" % (th, "  ".join("%7.2f" % mean(18, pol, p, "per_item") for pol in POLICIES[1:])))

say()
say("== C2. Seconds per garment (n = 18) against p_hidden, the share of garments whose opening is hidden by the garment itself")
say("p_hidden %s   direct_see  direct_sweep" % "  ".join("%7s" % p for p in POLICIES))
for ph in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
    p = replace(BASE, p_hidden=ph)
    t = [mean(18, pol, p, "per_item") for pol in POLICIES]
    say("%-8.2f %s   %10.2f  %12.2f" % (ph, "  ".join("%7.2f" % x for x in t), mean(18, "see", p, "direct"), mean(18, "sweep", p, "direct")))

say()
say("== D. Where the time goes (n = 18, defaults): regrasps, sweeps, second garments and set-asides per garment")
say("policy  regrasps  sweeps  doubles  fails")
for pol in POLICIES:
    say("%-7s %8.2f  %6.2f  %7.2f  %5.2f" % (pol, *(mean(18, pol, BASE, k) for k in ("regrasps", "sweeps", "doubles", "fails"))))

say()
say("== E. Pick time against the cost of a second garment coming along, p_double_each (n = 18)")
say("p_each %s" % "  ".join("%7s" % p for p in POLICIES))
for pe in (0.0, 0.04, 0.08, 0.15, 0.25):
    p = replace(BASE, p_double_each=pe)
    say("%-6.2f %s" % (pe, "  ".join("%7.2f" % mean(18, pol, p, "per_item") for pol in POLICIES)))

say()
say("== F. Into hanger-cell: replace its assumed pick (8 s, 0.85 success, 3 tries) by each policy's mean (n = 25 load, one arm, learned rule)")
from hanger_cell.model import Params as CellParams, bottleneck, replicate  # noqa: E402
say("pick               s/pick  min/load  items/h  bottleneck")
r = replicate(CellParams(), 100)
say("%-18s %6.1f  %8.2f  %7.1f  %s" % ("hanger-cell default", 8.0, r["makespan"] / 60, r["per_hour"], bottleneck(r)))
for pol in POLICIES:
    t = mean(25, pol, BASE, "per_item")
    r = replicate(replace(CellParams(), t_pick=t, p_pick=1.0, pick_tries=1), 100)
    say("%-18s %6.1f  %8.2f  %7.1f  %s" % (pol, t, r["makespan"] / 60, r["per_hour"], bottleneck(r)))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
