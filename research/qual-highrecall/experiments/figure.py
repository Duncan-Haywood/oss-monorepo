"""Write experiments/width_by_share.svg: mean 95% interval width (over the three high-recall coders) against the share
of the audit given to coder-negative items, one line per audit size, parsed from results.txt (section 5). The share-0
column is omitted (biased).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

shares = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5]
_, ys = table((HERE / "results.txt").read_text(), "5.", 0, [2, 3, 4, 5, 6, 7])
sizes = [100, 200, 400]
write_lines(HERE, "width_by_share.svg", "Interval width against the share of the audit spent on coder-negative items, high-recall coders",
            "Line plot: for 100, 200 and 400 audited items the interval is narrowest at 20 to 30 percent of the audit "
            "among coder-negatives, widens below 10 percent, and is slightly wider at half",
            "share of audited items drawn from coder-negatives", "mean width of the 95% interval",
            [(f"{n} audited items", shares, [ys[k][i] for k in range(len(shares))]) for i, n in enumerate(sizes)],
            logx=True, logy=False)
