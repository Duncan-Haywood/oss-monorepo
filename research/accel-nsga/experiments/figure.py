"""Write experiments/front_found.svg: share of the exact front found at equal budgets, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== front found", 0, [1, 2, 3, 4])
    names = ["random, 50 us", "NSGA-II, 50 us", "random, 200 us", "NSGA-II, 200 us"]
    write_lines(HERE, "front_found.svg", "Share of the exact Pareto front found, equal budgets",
                "Line plot of the share of the exact Pareto front found by random search and NSGA-II against the number of evaluated designs, at two latency deadlines; NSGA-II finds a larger share at every budget",
                "designs evaluated (of 3,840)", "share of exact front found", list(zip(names, [xs] * 4, ys)), logx=True)


if __name__ == "__main__":
    main()
