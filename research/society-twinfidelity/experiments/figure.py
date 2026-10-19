"""Write experiments/speed_by_crowd.svg and experiments/flip_by_crowd.svg from results.txt.

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["plaza people", "heterogeneous", "reaction delay", "30% stubborn", "all three"]


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3, 4, 5])
    write_lines(HERE, "speed_by_crowd.svg", "How fast people walk among committed robots, by kind of crowd",
                "Line plot of people's mean walking speed as a share of desired speed against the share of committed left robots, for five kinds of simulated crowd",
                "share of committed robots in the crowd", "people's speed / desired speed",
                [(n, xs, y) for n, y in zip(NAMES, ys)])
    xs, ys = table(TEXT, "== A.", 0, [1, 2, 3, 4, 5])
    write_lines(HERE, "flip_by_crowd.svg", "Share of people who end up preferring the robots' side, by kind of crowd",
                "Line plot of the share of simulated people preferring the left against the share of committed left robots, for five kinds of simulated crowd",
                "share of committed robots in the crowd", "people preferring the robots' side",
                [(n, xs, y) for n, y in zip(NAMES, ys)])


if __name__ == "__main__":
    main()
