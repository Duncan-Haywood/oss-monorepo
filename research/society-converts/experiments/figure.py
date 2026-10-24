"""Write experiments/final_share_by_robot_share.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CS = ("0", "0.001", "0.003", "0.01", "0.1")


def main():
    xs, ys = table(TEXT, "== C.", 0, [1, 2, 3, 4, 6])
    write_lines(HERE, "final_share_by_robot_share.svg",
                "Crowd on the robots' side after 1000 rounds, by robot share and conversion rate",
                "Line plot of the final share of non-robot people walking on the robots' side against committed robot share, for per-round conversion probabilities of the stubborn block from 0 to 0.1",
                "committed robot share", "share of people on the robots' side",
                [(f"c = {c}", xs, y) for c, y in zip(CS, ys)])


if __name__ == "__main__":
    main()
