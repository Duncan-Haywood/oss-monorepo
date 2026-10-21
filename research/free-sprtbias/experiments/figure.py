"""Write experiments/falsecert_vs_optimism.svg from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "4. Case p0", 0, [1, 2])
    series = list(zip(["fixed test", "SPRT"], [xs] * len(ys), ys))
    write_lines(HERE, "falsecert_vs_optimism.svg", "Chance of certifying an unacceptable policy (5% failure) against twin optimism ratio, p1 = 1%",
                "Line plot of the probability that a rollout test certifies a policy whose real failure rate is 5%, against the ratio of twin failure rate to real failure rate: near 0.05 at ratio 1 and rising steeply as the twin gets more optimistic",
                "twin rate / real rate", "P(certify)", series)


if __name__ == "__main__":
    main()
