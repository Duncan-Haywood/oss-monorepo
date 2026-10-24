"""Sequential replay of swe-allocate's four policies on the committed project scores.

Each arm is a track with at least 6 scored projects; pulling it yields its next project in
commit order, so a track runs out and its returns follow the history instead of a stationary
bootstrap. Budgets 5000, 10000 and 20000 lines; 300 seeds (the policies' randomness only).
"""
import csv, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "swe-ledger", "src"))
from swe_ledger.ledger import track_of
from swe_decay.seq import *

rows = sorted(csv.DictReader(open(os.path.join(HERE, "scores.csv"))), key=lambda r: r["first_added"])
SEEDS = 300

def seqs_for(col):
    p = {}
    for r in rows:
        t = track_of(r["slug"]); c = float(r["lines_added"])
        if t != "other" and c > 0:
            p.setdefault(t, []).append((float(r[col]), c))
    return {t: v for t, v in p.items() if len(v) >= 6}

out = []
for col in ("pass_A", "pass_B"):
    seqs = seqs_for(col)
    cmax = max(c for s in seqs.values() for _, c in s)
    out.append(f"== value = {col}; arms: " + ", ".join(f"{t} (n={len(s)}, {sum(c for _, c in s):.0f} lines, decay {fit_decay(s):+.3f}/pull)" for t, s in sorted(seqs.items())))
    for budget in (5000, 10000, 20000):
        orc = hindsight(seqs, budget); arm, fixed = best_fixed_arm(seqs, budget)
        out.append(f"-- budget {budget} lines; hindsight-greedy reference {orc:.0f} value points; best single track {arm} {fixed:.0f}")
        for cls in (Uniform, Greedy, Thompson, KnapsackUCB):
            res = [run_seq(cls, seqs, budget, s, cmax) for s in range(SEEDS)]
            m, lo, hi = mean_ci([r[0] for r in res])
            ex = sum(r[2] for r in res) / SEEDS
            out.append(f"{cls.name:13s} mean {m:6.1f}  95% CI [{lo:6.1f}, {hi:6.1f}]  ({m/orc:.0%} of hindsight)  tracks exhausted {ex:.2f}")
    out.append("")
text = "\n".join(out)
open(os.path.join(HERE, "results.txt"), "w").write(text + "\n"); print(text)
