"""Write experiments/mean_vs_cap.svg: optimal vs grid-tuned vs fixed mean rollouts against the cap, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "2. Mean rollouts", 0, [1, 2, 3])
    series = list(zip(["optimal (backward induction)", "grid-tuned SPRT (free-sprtcut)", "fixed-size test"], [xs] * len(ys), ys))
    write_lines(HERE, "mean_vs_cap.svg", "Mean rollouts against the cap, p1 = 1% against p0 = 5%, both errors held at 5%",
                "Line plot of mean rollouts against cap as a multiple of the fixed test size: the optimal test sits 3 to 9 percent below the grid-tuned SPRT at every cap and both are far below the fixed test at 181",
                "cap as a multiple of the fixed size", "mean rollouts", series)


if __name__ == "__main__":
    main()
