"""Do cheap-prior starts remove the small-budget loss of greedy and Thompson allocation?

Policies: uniform; greedy and Thompson with two forced pulls per track (swe-allocate) and one;
shrinkage greedy with a prior of K pseudo-lines (no forced pulls), K = 500, 2000, 8000.
Part 1: the observed history (swe-decay's setting), 300 policy seeds.
Part 2: 200 block-4 bootstrap histories x 3 policy seeds (swe-bootstrap's setting).
Budgets 5000, 10000, 20000 lines; value = pass_A or pass_B.
"""
import csv, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "swe-ledger", "src"))
from swe_ledger.ledger import track_of
from swe_warmstart.warm import *

rows = sorted(csv.DictReader(open(os.path.join(HERE, "scores.csv"))), key=lambda r: r["first_added"])

def seqs_for(col):
    p = {}
    for r in rows:
        t = track_of(r["slug"]); c = float(r["lines_added"])
        if t != "other" and c > 0:
            p.setdefault(t, []).append((float(r[col]), c))
    return {t: v for t, v in p.items() if len(v) >= 6}

POLS = [Uniform, Greedy, Greedy1, Thompson, Thompson1, shrink_greedy(500), shrink_greedy(2000), shrink_greedy(8000)]
out = []
for col in ("pass_A", "pass_B"):
    seqs = seqs_for(col)
    cmax = max(c for s in seqs.values() for _, c in s)
    out.append(f"== value = {col}")
    out.append("-- part 1: observed history, 300 policy seeds (mean value points, 95% CI over seeds)")
    for budget in (5000, 10000, 20000):
        orc = hindsight(seqs, budget)
        cells = []
        for p in POLS:
            res = [run_seq(p, seqs, budget, s, cmax)[0] for s in range(300)]
            m, lo, hi = mean_ci(res)
            cells.append(f"{p.name} {m:.1f} [{lo:.1f}, {hi:.1f}]")
        out.append(f"budget {budget} (hindsight {orc:.0f}): " + "; ".join(cells))
    ks = [shrink_greedy(k) for k in (0.001, 1e7)]
    out.append("-- prior-size check, observed history (K = 0.001 and 10^7 pseudo-lines; budgets 5000 / 10000 / 20000): " + "; ".join(
        f"{p.name} " + " / ".join(f"{sum(run_seq(p, seqs, b, s, cmax)[0] for s in range(300))/300:.1f}" for b in (5000, 10000, 20000)) for p in ks))
    out.append("-- part 2: block-4 bootstrap, 200 histories x 3 seeds; policy minus uniform, 95% percentile interval, share of histories won")
    for budget in (5000, 10000, 20000):
        d, ref = paired_diffs(POLS, seqs, budget, 200, 3, 4)
        out.append(f"budget {budget}")
        for name, xs in d.items():
            lo, hi = percentile_ci(xs)
            out.append(f"  {name:17s} diff {sum(xs)/len(xs):+6.1f}  [{lo:+6.1f}, {hi:+6.1f}]  wins {sum(x > 0 for x in xs)/len(xs):.0%}")
    out.append("")
text = "\n".join(out)
open(os.path.join(HERE, "results.txt"), "w").write(text + "\n"); print(text)
