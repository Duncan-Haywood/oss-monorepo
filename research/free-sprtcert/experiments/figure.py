"""Write experiments/asn_vs_rate.svg: expected trials of the SPRT against the true failure rate, with the fixed-n line, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "3. Expected trials", 0, [1, 2])
    series = list(zip(["SPRT expected trials", "best fixed-n test"], [xs] * len(ys), ys))
    write_lines(HERE, "asn_vs_rate.svg", "Rollouts needed to certify p1 = 1% against p0 = 5% (alpha = beta = 5%)",
                "Line plot of expected rollouts against the true failure rate: the sequential test uses 79 to 158, the fixed test always 181",
                "true failure rate", "rollouts", series)


if __name__ == "__main__":
    main()
