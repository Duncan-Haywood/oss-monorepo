"""Write experiments/mutation_sweep.svg: share of the exact front found against mutation rate, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== front found by mutation rate", 0, [1, 2, 3, 4])
    names = ["pop 20, 50 us", "pop 80, 50 us", "pop 20, 200 us", "pop 80, 200 us"]
    write_lines(HERE, "mutation_sweep.svg", "Share of the exact front found, 400 designs, by mutation rate",
                "Line plot of the share of the exact Pareto front NSGA-II finds at a budget of 400 designs against per-gene mutation rate, for population 20 and 80 at two deadlines; lower mutation rates and the smaller population find more",
                "per-gene mutation rate", "share of exact front found", list(zip(names, [xs] * 4, ys)), logx=True)


if __name__ == "__main__":
    main()
