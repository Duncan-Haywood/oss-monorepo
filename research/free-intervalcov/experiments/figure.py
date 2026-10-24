"""Write experiments/coverage.svg: exact coverage of four 95% upper bounds against the true failure rate (n = 100), parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "# 5. Coverage", 0, [1, 2, 3, 4])
    series = list(zip(["Clopper-Pearson", "Wilson", "Jeffreys", "Agresti-Coull"], [xs] * len(ys), ys))
    write_lines(HERE, "coverage.svg", "Exact coverage of 95% upper bounds on a failure rate, n = 100 rollouts",
                "Line plot of exact coverage against true failure rate from 0.2% to 20%: Clopper-Pearson never drops below 0.95, Wilson to 0.93, Jeffreys to 0.85",
                "true failure rate", "coverage", series)


if __name__ == "__main__":
    main()
