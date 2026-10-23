"""Write experiments/enforcers_needed.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3])
    write_lines(HERE, "enforcers_needed.svg", "Enforcer robots needed to hold a queue norm, by cutter-robot share",
                "Line plot of the least enforcer-robot share that keeps most people queueing against a given share of line-cutting robots, for 5, 10 and 20 people in view of each cut",
                "line-cutting robot share", "enforcer robot share needed",
                [(f"{v} in view", xs, y) for v, y in zip((5, 10, 20), ys)])


if __name__ == "__main__":
    main()
