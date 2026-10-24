"""Write experiments/go_share.svg and experiments/crowd_cost.svg, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, y0 = table(TEXT, "== B0.", 0, [2, 5])
    _, y1 = table(TEXT, "== B1.", 0, [2, 5])
    write_lines(HERE, "go_share.svg", "Doorway: share of people who go, by robot share",
                "Line plot of the share of people who go at the door against the share of robots, for robots that always yield and robots that always go",
                "share of the crowd that is robots", "people who go (share)",
                [("robots always yield", xs, y0[0]), ("robots always go", xs, y1[0])])
    write_lines(HERE, "crowd_cost.svg", "Doorway: mean cost per encounter, whole crowd",
                "Line plot of the whole crowd's mean cost per door encounter against the robot share, for robots that always yield and robots that always go",
                "share of the crowd that is robots", "mean cost per encounter",
                [("robots always yield", xs, y0[1]), ("robots always go", xs, y1[1])])


if __name__ == "__main__":
    main()
