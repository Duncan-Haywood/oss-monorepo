"""Write experiments/worst_coverage.svg: the worst 95%-interval coverage over eight coders of known bias, by
hand-coded audit size, for each gate, parsed from results.txt (E4).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

xs, ys = table((HERE / "results.txt").read_text(), "E4.", 0, [1, 2, 5, 6, 7])
names = ["always PPI (= every TOST at 0.02 or less)", "difference-test gate", "TOST, tolerance 0.02", "TOST, tolerance 0.05",
         "split-sample gate"]
write_lines(HERE, "worst_coverage.svg", "Worst coverage of the 95% interval over eight coders, by hand-coded audit size",
            "Line plot: always-PPI and every TOST with tolerance 0.02 or tighter stay at 0.94 to 1.00 because they never pass the coder; "
            "the difference-test and split-sample gates stay below 0.4 up to 1,600 items; the TOST with tolerance 0.05 falls from 0.95 to 0.35",
            "hand-coded items in the audit", "worst coverage over coders", [(n, xs, y) for n, y in zip(names, ys)],
            logx=True, logy=False, hline=0.95)
