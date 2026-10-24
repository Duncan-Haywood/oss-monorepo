"""Write experiments/width_rare_group.svg: mean 95% interval width of the group gap for a rare group (longest 11% of
comments vs the rest), by audit size and audit design, parsed from results.txt (G2.5).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

xs, ys = table((HERE / "results.txt").read_text(), "G2.5", 0, [1, 2, 3])
names = ["random sample of the corpus", "equal numbers per group", "optimal share (oracle)"]
write_lines(HERE, "width_rare_group.svg", "Interval width for the gap to a rare group (11% of comments), by audit size and design",
            "Line plot: a random audit gives intervals 1.2 to 1.7 times as wide as an audit with equal numbers per group; "
            "the optimal split is indistinguishable from equal",
            "hand-coded items in the audit", "mean width of the 95% interval", [(n, xs, y) for n, y in zip(names, ys)],
            logx=True, logy=False)
