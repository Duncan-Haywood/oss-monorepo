"""All experiments for hanger-cell; writes results.txt (deterministic, seeded).

PYTHONPATH=src python3 experiments/run.py      about 3 s, stdlib only
"""
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_cell.model import MIX, Params, bottleneck, hang_share, replicate  # noqa: E402

HERE = Path(__file__).resolve().parent
REPS = 200
out = []


def say(s=""):
    print(s)
    out.append(s)


BASE = Params()
DESIGNS = ["wire", "wood-shaped", "custom-rigid", "adjustable", "collapsible"]
DRYER_MIN = 45.0                       # assumed dryer cycle, the time a cell has to clear one load

say("== A. Hanger design and arms, learned hang-or-fold rule, load of %d (mean of %d loads)" % (BASE.load, REPS))
say("design        arms  min/load  items/h  hung  folded  aside  bottleneck  u_arms  u_feeder  u_fold")
for design in DESIGNS:
    for arms in (1, 2, 3):
        r = replicate(replace(BASE, design=design, arms=arms), REPS)
        say("%-13s %4d  %8.2f  %7.1f  %4.1f  %6.1f  %5.2f  %-10s  %6.2f  %8.2f  %6.2f" % (
            design, arms, r["makespan"] / 60, r["per_hour"], r["hung"], r["folded"], r["aside"], bottleneck(r),
            r["u_arms"], r["u_feeder"], r["u_fold"]))

say()
say("== B. Policy and design, one arm: does the hanger matter once more of the load is hung? (items/h)")
say("policy        " + "  ".join("%12s" % d for d in DESIGNS))
for policy in ("always_fold", "learned", "always_hang"):
    row = []
    for design in DESIGNS:
        r = replicate(replace(BASE, design=design, policy=policy), REPS)
        row.append("%12.1f" % r["per_hour"])
    say("%-13s " % policy + "  ".join(row))

say()
say("== C. Load mix, one arm, adjustable hanger, learned rule")
say("mix            share_hung_in_mix  items/h  min/load  hung  folded  aside")
MIXES = {
    "household": MIX,
    "tee-heavy": {"tee": 0.7, "shirt": 0.1, "linen": 0.0, "fleece": 0.1, "sweater": 0.1},
    "shirt-heavy": {"tee": 0.1, "shirt": 0.7, "linen": 0.1, "fleece": 0.05, "sweater": 0.05},
}
share = hang_share()
for name, mix in MIXES.items():
    r = replicate(replace(BASE, mix=mix), REPS)
    exp = sum(mix[k] * share[k] for k in mix)
    say("%-14s %17.2f  %7.1f  %8.2f  %4.1f  %6.1f  %5.2f" % (name, exp, r["per_hour"], r["makespan"] / 60,
                                                          r["hung"], r["folded"], r["aside"]))

say()
say("== D. Which assumption moves the time to clear a load? One at a time, x0.5 and x2, one arm, adjustable hanger")
say("parameter           base   min/load_x0.5  min/load_x2  swing_min")
base_min = replicate(BASE, REPS)["makespan"] / 60
say("(baseline %.2f min per load)" % base_min)
KNOBS = ["t_pick", "t_sense", "t_feed", "t_rail", "t_to_fold", "t_fold", "t_refill", "t_pick_fail", "insertion_scale"]
rows = []
for k in KNOBS:
    b = getattr(BASE, k)
    lo = replicate(replace(BASE, **{k: b * 0.5}), REPS)["makespan"] / 60
    hi = replicate(replace(BASE, **{k: b * 2.0}), REPS)["makespan"] / 60
    rows.append((abs(hi - lo), k, b, lo, hi))
b = BASE.p_pick                          # a probability: compare 0.6 with 0.95 instead of scaling
lo = replicate(replace(BASE, p_pick=0.95), REPS)["makespan"] / 60
hi = replicate(replace(BASE, p_pick=0.60), REPS)["makespan"] / 60
rows.append((abs(hi - lo), "p_pick(0.95|0.60)", b, lo, hi))
for sw, k, b, lo, hi in sorted(rows, reverse=True):
    say("%-18s %6.2f  %13.2f  %11.2f  %9.2f" % (k, b, lo, hi, sw))

say()
say("== E. Pick success against throughput and what is left for a person (one arm, adjustable, learned)")
say("p_pick  items/h  min/load  aside_per_100  pick_fails_per_load  ins_fail_per_load")
for pp in (0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.99):
    r = replicate(replace(BASE, p_pick=pp), REPS)
    say("%.2f   %7.1f  %8.2f  %13.1f  %19.2f  %17.3f" % (pp, r["per_hour"], r["makespan"] / 60,
                                                         100 * r["aside"] / BASE.load, r["pick_fail"], r["ins_fail"]))

say()
say("== F. Dryers one cell can serve (%g min cycle, load of %d, measured on a pile of 100 items)" % (DRYER_MIN, BASE.load))
say("arms  items/h  dryers_served  bottleneck")
for arms in (1, 2, 3, 4):
    r = replicate(replace(BASE, arms=arms, load=100), REPS)
    need = BASE.load / (DRYER_MIN / 60.0)             # items per hour one dryer delivers
    say("%4d  %7.1f  %13.1f  %s" % (arms, r["per_hour"], r["per_hour"] / need, bottleneck(r)))

say()
say("== G. Where the arm's time goes, one arm, per item (seconds of station time per item, learned rule)")
say("design        arm_s  feeder_s  fold_s")
for design in DESIGNS:
    r = replicate(replace(BASE, design=design), REPS)
    say("%-13s %5.1f  %8.2f  %6.1f" % (design, r["arm_s_per_item"], r["feeder_s_per_item"], r["fold_s_per_item"]))

say()
say("== H. Slower insertion than hanger-insert models: all insertion times scaled (adjustable, learned), min per load")
say("scale  1_arm  2_arms")
for sc in (1, 2, 3, 5):
    a1 = replicate(replace(BASE, insertion_scale=sc, arms=1), REPS)["makespan"] / 60
    a2 = replicate(replace(BASE, insertion_scale=sc, arms=2), REPS)["makespan"] / 60
    say("%5g  %5.2f  %6.2f" % (sc, a1, a2))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
