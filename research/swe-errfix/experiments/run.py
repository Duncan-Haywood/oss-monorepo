"""Two-fold held-out check of refitted swe-errors rules, over many random splits.  python experiments/run.py > experiments/results.txt"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from swe_errfix import load_items, two_fold, wilson, split, accuracy, refit, RULES  # noqa: E402

items = load_items()
SEEDS = range(200)
rows = [two_fold(items, s) for s in SEEDS]
n = rows[0][2]
base = [r[0] for r in rows]
new = [r[1] for r in rows]
d = [b - a for a, b in zip(base, new)]
print(f"entries {len(items)}; {len(SEEDS)} random run-level splits into two folds; each fit uses one fold and is scored on the other, both ways ({n} scored per split)")
print(f"baseline swe-errors rules on those entries: correct {sum(base)/len(base):.1f} of {n} (the same rules every split; they were not fit on any fold)")
print(f"refit rules, held-out: correct mean {sum(new)/len(new):.1f} of {n} = {sum(new)/len(new)/n:.1%}")
print(f"paired gain per split: mean {sum(d)/len(d):+.2f} entries; min {min(d):+d}, max {max(d):+d}; splits with gain > 0: {sum(1 for x in d if x>0)}, = 0: {sum(1 for x in d if x==0)}, < 0: {sum(1 for x in d if x<0)}")
lo, hi = wilson(round(sum(new) / len(new)), n)
print(f"Wilson 95% on the refit held-out accuracy (n={n}, ignores split-to-split spread): {lo:.1%} to {hi:.1%}")
print("\nseed 0 split, in detail")
for order, added, nd, nh in rows[0][3]:
    print(f"  fit on {nd}, scored on {nh}: order {order}; added {added}")
print("\nfit on all 60 (descriptive only, scored on its own training data, not a held-out number)")
rules, added = refit([(t, h) for _, t, h in items])
print(f"  order {[n_ for n_, _ in rules]}; added {added}; accuracy {accuracy(rules, [(t, h) for _, t, h in items])}/60 against baseline {accuracy(RULES, [(t, h) for _, t, h in items])}/60")
