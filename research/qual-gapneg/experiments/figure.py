"""Write experiments/coverage_by_interval.svg: worst coverage over the four coders of the short-minus-long gap
against coder-negative items k, one line per interval, parsed from results.txt (section 5; the 'random' row is
left out of the line plot).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

ks = [5, 10, 20, 50]
names = ["Wald", "plus-two", "Jeffreys", "pooled negatives"]
_, cols = table((HERE / "results.txt").read_text(), "5.", 0, [1, 2, 3, 4])
cols = cols[:len(ks)]
series = [(nm, ks, [c[i] for c in cols]) for i, nm in enumerate(names)]
write_lines(HERE, "coverage_by_interval.svg", "Worst coverage of a 95% interval for a group gap by coder-negative items audited",
            "Line plot: Jeffreys and plus-two intervals stay at 0.94 to 0.99 from 5 coder-negative items on; Wald is 0.58 at 5 "
            "and 0.93 at 50; an interval that pools the two groups' negatives is near 0.03 to 0.07 for one coder",
            "coder-negative items in the audit (k)", "worst coverage over four coders", series,
            logx=False, logy=False)
