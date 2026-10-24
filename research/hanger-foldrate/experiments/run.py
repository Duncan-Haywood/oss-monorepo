"""hanger-foldrate: hanger-cell with a published fold time. Stdlib only, ~20 s. Writes results.txt.

PYTHONPATH=src:../hanger-cell/src python3 experiments/run.py
"""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "hanger-cell" / "src"))
from hanger_cell.model import Params, bottleneck, replicate  # noqa: E402

REPS = 200
out = []


def say(s=""):
    print(s)
    out.append(s)


BASE = Params()
DRYER_MIN = 45.0
# Source: Avigal et al. 2022 (SpeedFolding, IROS), abstract: 30-40 folds/h, under 120 s per garment, 93% success;
# prior work 3-6 folds/h. 3600/40 = 90 s, 3600/30 = 120 s, 3600/6 = 600 s, 3600/3 = 1200 s.
FOLD_S = [("assumed (hanger-cell)", 25.0), ("SpeedFolding fast, 40/h", 90.0), ("SpeedFolding, 30/h", 120.0),
          ("prior best, 6/h", 600.0), ("prior typical, 3/h", 1200.0)]

say("== A. One arm, adjustable hanger, learned rule: fold time per item (fold mechanism = one table)")
say("fold_time                 t_fold_s  items/h  dryers  hung  folded  bottleneck  u_arms  u_fold")
for name, t in FOLD_S:
    r = replicate(replace(BASE, t_fold=t), REPS)
    say("%-25s %8.0f  %7.1f  %6.1f  %4.1f  %6.1f  %-10s  %6.2f  %6.2f" % (
        name, t, r["per_hour"], r["per_hour"] * DRYER_MIN / 60 / BASE.load,
        r["hung"], r["folded"], bottleneck(r), r["u_arms"], r["u_fold"]))

say()
say("== B. Policy at each fold time (items/h, one arm, adjustable): does hanging beat folding once folding is slow?")
say("t_fold_s  always_fold  learned  always_hang")
for name, t in FOLD_S:
    row = [replicate(replace(BASE, t_fold=t, policy=pol), REPS)["per_hour"] for pol in ("always_fold", "learned", "always_hang")]
    say("%8.0f  %11.1f  %7.1f  %11.1f" % (t, *row))

say()
say("== C. Fold tables needed to keep up (t_fold 120 s, learned rule, 1 arm vs 2 arms; items/h)")
say("tables  1_arm  2_arms")
for n in (1, 2, 3, 4, 6, 8):
    row = [replicate(replace(BASE, t_fold=120.0, fold_tables=n, arms=a), REPS)["per_hour"] for a in (1, 2)]
    say("%6d  %5.1f  %6.1f" % (n, *row))

say()
say("== D. Crossover: fold time above which always_hang beats always_fold (1 arm, adjustable)")
lo, hi = 5.0, 600.0
f = lambda t, pol: replicate(replace(BASE, t_fold=t, policy=pol), REPS)["per_hour"]
for _ in range(14):
    mid = (lo + hi) / 2
    if f(mid, "always_hang") > f(mid, "always_fold"):
        hi = mid
    else:
        lo = mid
say("crossover t_fold = %.1f s" % ((lo + hi) / 2))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
