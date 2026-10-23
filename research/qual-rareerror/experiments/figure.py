"""Write experiments/width_by_flip.svg: mean 95% interval width of the rare-group gap at 200 audited items, by extra
coder error injected in the rare group and audit design, parsed from results.txt (R5).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

xs, ys = table((HERE / "results.txt").read_text(), "R5", 0, [1, 2, 3])
names = ["random sample of the corpus", "equal numbers per group", "optimal share (oracle)"]
write_lines(HERE, "width_by_flip.svg", "Interval width for the gap to a rare group, by extra coder error in that group (200 items)",
            "Line plot: widths rise a few percent with injected error, and equal numbers per group stays level with the optimal share",
            "probability a coder label in the rare group is flipped", "mean width of the 95% interval",
            [(n, xs, y) for n, y in zip(names, ys)], logx=False, logy=False)
