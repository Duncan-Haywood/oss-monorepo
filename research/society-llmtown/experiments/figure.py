"""Write experiments/kept.svg from results.txt (never retyped numbers).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A.", 0, [1, 2, 3])
    names = ["0% hurried robots", "20% hurried robots", "50% hurried robots"]
    write_lines(HERE, "kept.svg", "Share of 'always yield to people' meetings the robots keep, by urgency pressure",
                f"Line plot: the share of meetings in which a robot that stated 'always yield' actually yielded falls from {ys[0][0]:.2f} with no urgency pressure to {ys[0][-1]:.2f} at full pressure, whatever the share of hurried robots",
                "urgency pressure (0 = none, 1 = full)", "share of stated-norm meetings kept",
                list(zip(names, [xs] * 3, ys)))


if __name__ == "__main__":
    main()
