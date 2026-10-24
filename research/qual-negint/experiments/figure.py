"""Write experiments/coverage_by_interval.svg: worst coverage over the four coders against coder-negative items k,
one line per interval, parsed from results.txt (section 3).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

ks = [5, 10, 20, 50]
names = ["Wald (qual-negaudit)", "plus-two", "Wilson", "Jeffreys"]
_, cols = table((HERE / "results.txt").read_text(), "3.", 0, [1, 2, 3, 4])
series = [(nm, ks, [c[i] for c in cols]) for i, nm in enumerate(names)]
write_lines(HERE, "coverage_by_interval.svg", "Worst coverage of a 95% interval by coder-negative items audited",
            "Line plot: the Wald interval covers 0.63 of the time at 5 coder-negative items and 0.93 at 50; plus-two, "
            "Wilson and Jeffreys intervals are at 0.93 to 0.97 from 5 items on",
            "coder-negative items in the audit (k)", "worst coverage over four coders", series,
            logx=False, logy=False)
