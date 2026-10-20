"""Write experiments/trust_by_episode.svg: the town's mean trust in each episode, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run build_show.py first if the episodes change.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["1 The Dent", "2 The Lockout", "3 The Apology", "4 Two Towns (seed 0)", "5 Two Towns (seed 1)"]


def main():
    xs, ys = table(TEXT, "== A.", 0, [1, 2, 3, 4, 5])
    series = list(zip(NAMES, [xs] * len(ys), ys))
    write_lines(HERE, "trust_by_episode.svg", "Robot Town: mean trust in the robots, five simulated episodes",
                "Line plot of mean trust over 400 rounds in five simulated episodes; trust falls during the incident at round 60 to 110, then recovers in three episodes and stays low in two",
                "round (incident: 60 to 110)", "mean trust (0 to 1)", series)


if __name__ == "__main__":
    main()
