"""Write experiments/loss.svg: total cost per hectare (fleet plus late-yield loss) against the window, 1.62 ha fields (Sweep 3).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "# Sweep 3: total cost against window", 0, [1, 2])
    write_lines(HERE, "loss.svg", "Fleet plus late-yield cost per hectare by window, 1.62 ha fields (assumed prices)",
                "Line plot of total cost per hectare, fleet plus a 2 percent per leaf stage late-yield loss, for the best scout-and-treater fleet and the best inline fleet as the pest window closes between 2 and 32 hours after the start",
                "window closes after, hours", "USD per hectare",
                [("scout + treaters (up to 4 scouts)", xs, ys[0]), ("inline robots", xs, ys[1])])


if __name__ == "__main__":
    main()
