"""Write experiments/people_flip.svg and experiments/crowd_speed.svg from results.txt.

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== C.", 0, [1, 2, 3])
    write_lines(HERE, "people_flip.svg", "Share of people who end up preferring the robots’ side",
                "Line plot of the share of simulated people preferring the left against the share of committed left robots, for human memories of 3, 9 and 25 partners; no curve jumps to 1: the share rises gradually and levels off between 0.3 and 0.6 for memories 3 and 9",
                "share of committed robots in the crowd", "people preferring the robots’ side",
                [(n, xs, y) for n, y in zip(["memory 3", "memory 9", "memory 25"], ys)])
    xa, ya = table(TEXT, "== A.", 0, [7])
    xb, yb = table(TEXT, "== B.", 0, [7])
    write_lines(HERE, "crowd_speed.svg", "How fast people walk (memory 9)",
                "Line plot of people's mean walking speed as a share of desired speed against robot share; with adaptive robots it stays near 0.91, with committed left robots it falls to about 0.4 once robots are a third of the crowd",
                "share of robots in the crowd", "people's speed / desired speed",
                [("committed robots", xa, ya[0]), ("adaptive robots", xb, yb[0])])


if __name__ == "__main__":
    main()
