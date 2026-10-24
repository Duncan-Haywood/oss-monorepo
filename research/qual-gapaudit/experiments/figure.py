"""Write experiments/worst_coverage.svg: the worst 95%-interval coverage of the short-minus-long gap over eight
coders of known bias, by hand-coded audit size, for each rule, parsed from results.txt (E4).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

xs, ys = table((HERE / "results.txt").read_text(), "E4.", 0, [1, 2, 3])
names = ["always PPI (= both TOST gates)", "difference test on all audited items", "z test on the gap bias"]
write_lines(HERE, "worst_coverage.svg", "Worst coverage of the 95% interval for the group gap over eight coders, by audit size",
            "Line plot: always-PPI stays at 0.94 to 0.99; the overall difference test falls to 0.004 at 1,600 items; the gap-bias test "
            "is 0.23 at 100 items and recovers to 0.97 from 800",
            "hand-coded items in the audit", "worst coverage over coders", [(n, xs, y) for n, y in zip(names, ys)],
            logx=True, logy=False, hline=0.95)
