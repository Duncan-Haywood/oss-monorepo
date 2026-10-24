"""Write experiments/final_share_by_robot_share.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
KS = ("none (never converts)", "30 robot meetings", "10", "3", "1")


def main():
    xs, ys = table(TEXT, "== D.", 0, [1, 2, 3, 4, 5])
    write_lines(HERE, "final_share_by_robot_share.svg",
                "Crowd on the robots' side after 1000 rounds, by robot share and conversion threshold",
                "Line plot of the final share of non-robot people walking on the robots' side against committed robot share, for stubborn people who convert after meeting a robot 1, 3, 10 or 30 times, or never",
                "committed robot share", "share of people on the robots' side",
                [(f"k = {k}", xs, y) for k, y in zip(KS, ys)])


if __name__ == "__main__":
    main()
