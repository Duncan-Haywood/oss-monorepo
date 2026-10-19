"""Block-bootstrap intervals for swe-decay's policy comparison (pass A and B; budgets 5k, 10k, 20k lines).

Per budget and block length, 200 resampled histories; each replicate averages 5 policy seeds.
Reports mean policy-minus-uniform difference, a 95% percentile interval over histories, and the
share of histories where the policy beats uniform.
"""
import csv, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "swe-ledger", "src"))
from swe_ledger.ledger import track_of
from swe_bootstrap.boot import *

rows = sorted(csv.DictReader(open(os.path.join(HERE, "scores.csv"))), key=lambda r: r["first_added"])
REPS, SEEDS = 200, 5

def seqs_for(col):
    p = {}
    for r in rows:
        t = track_of(r["slug"]); c = float(r["lines_added"])
        if t != "other" and c > 0:
            p.setdefault(t, []).append((float(r[col]), c))
    return {t: v for t, v in p.items() if len(v) >= 6}

out = [f"block bootstrap: {REPS} histories x {SEEDS} policy seeds; difference = policy minus uniform, value points"]
pols = [Uniform, Greedy, Thompson, KnapsackUCB]
for col in ("pass_A", "pass_B"):
    seqs = seqs_for(col)
    out.append(f"== value = {col}")
    for block in (1, 4):
        for budget in (5000, 10000, 20000):
            d, ref = paired_diffs(pols, seqs, budget, REPS, SEEDS, block)
            out.append(f"-- block {block}, budget {budget}; mean hindsight reference {sum(ref)/len(ref):.0f}")
            for name, xs in d.items():
                lo, hi = percentile_ci(xs)
                out.append(f"{name:13s} diff {sum(xs)/len(xs):+7.1f}  95% [{lo:+7.1f}, {hi:+7.1f}]  beats uniform in {sum(x > 0 for x in xs)/len(xs):.0%} of histories")
    out.append("")
text = "\n".join(out)
open(os.path.join(HERE, "results.txt"), "w").write(text + "\n"); print(text)
