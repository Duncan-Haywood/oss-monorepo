"""Write experiments/mean_vs_p.svg from curve.txt (written by curve.py):  python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "curve.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "2. Mean rollouts", 0, [1, 2, 3])
    series = list(zip(["fixed-size test", "average-optimal test", "minimax test"], [xs] * len(ys), ys))
    write_lines(HERE, "mean_vs_p.svg", "Mean rollouts against the true failure rate, p1 = 1% against p0 = 5%, cap 362",
                "Line plot of mean rollouts against the true failure rate: the average-optimal test peaks near 131 rollouts between the two rates, the minimax test flattens the peak to 124, both well below the fixed test at 181",
                "true failure rate p", "mean rollouts", series)


if __name__ == "__main__":
    main()
