"""Write experiments/mean_vs_cap.svg: mean rollouts of the error-holding capped SPRT against the cap, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "2. Mean trials", 0, [1, 2, 3])
    series = list(zip(["re-tuned (both errors <= 0.05)", "Wald boundaries + sign rule (errors not held)", "fixed-size test"], [xs] * len(ys), ys))
    write_lines(HERE, "mean_vs_cap.svg", "Mean rollouts against the cap, p1 = 1% against p0 = 5%",
                "Line plot of mean rollouts against cap as a multiple of the fixed test size: the re-tuned test costs most at a cap equal to the fixed size and falls toward the plain Wald figure as the cap grows; the fixed test is a flat line at 181",
                "cap as a multiple of the fixed size", "mean rollouts", series)


if __name__ == "__main__":
    main()
