"""Write experiments/width_by_design.svg: mean 95% interval width of the prevalence estimate over the four coders, by
audit size and design (the positives-only audit is omitted: its interval is narrow because it is wrong), parsed from
results.txt (section 5).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

xs, ys = table((HERE / "results.txt").read_text(), "5.", 0, [1, 2, 3, 4])
names = ["random sample, prediction-powered mean", "same sample, stratified by coder label",
         "equal numbers per coder label", "Neyman allocation (oracle)"]
write_lines(HERE, "width_by_design.svg", "Interval width for a code's prevalence, by audit size and design",
            "Line plot: the random-sample prediction-powered interval is about 23% wider than the same sample read as "
            "stratified by coder label; equal and Neyman allocation add little on top",
            "hand-coded items in the audit", "mean width of the 95% interval", [(n, xs, y) for n, y in zip(names, ys)],
            logx=True, logy=False)
