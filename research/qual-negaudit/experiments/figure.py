"""Write experiments/coverage_by_negatives.svg: worst coverage over the four coders against the number k of
coder-negative items in the audit, one line per audit size, parsed from results.txt (section 6).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

ks = [0, 2, 5, 10, 20, 50]
sizes, cols = table((HERE / "results.txt").read_text(), "6.", 0, [1, 2, 3, 4, 5, 6])
series = [(f"{int(n)} audited items", ks, [c[i] for c in cols]) for i, n in enumerate(sizes)]
write_lines(HERE, "coverage_by_negatives.svg", "Coverage of the 95% interval by coder-negative items audited",
            "Line plot: with no coder-negative items audited coverage is 0; it reaches about 0.94 at 50 coder-negative "
            "items whatever the total audit size",
            "coder-negative items in the audit (k)", "worst coverage over four coders", series,
            logx=False, logy=False)
