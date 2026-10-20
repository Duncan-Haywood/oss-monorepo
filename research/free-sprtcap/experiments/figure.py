"""Write experiments/error_vs_cap.svg: achieved error rates of the truncated SPRT against the rollout cap, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "3. Achieved error rates", 0, [1, 2])
    series = list(zip(["unacceptable-rate error (nominal 0.05)", "acceptable-rate error (nominal 0.05)"], [xs] * len(ys), ys))
    write_lines(HERE, "error_vs_cap.svg", "Error rates of a truncated SPRT, p1 = 1% against p0 = 5% (fixed test needs 181 rollouts)",
                "Line plot of the two achieved error rates against the rollout cap: the unacceptable-rate error stays above 0.05 at every cap tried and falls to 0.050 by a cap of 360, while the acceptable-rate error is above 0.05 only for caps up to about 200 and then sits between 0.03 and 0.05",
                "rollout cap", "error rate", series)


if __name__ == "__main__":
    main()
