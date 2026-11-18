"""Write superadditivity.svg: exact harm of stalling m random segments over the sum of their single-segment harms.

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "Superadditivity of random stall sets", 0, [1, 2, 3])
    series = list(zip(["cosine", "constant", "warmup-stable-decay"], [xs] * 3, ys))
    write_lines(HERE, "superadditivity.svg", "Stalled segments do not add up (40 seeds)",
                "Line plot, log scale, of exact harm over summed single-segment harm for random sets of stalled"
                " segments: about 1.1 at 10 segments, 1.3 at 25, 2.5 at 50 and about 60 when all 75 are stalled,"
                " on all three learning-rate schedules",
                "segments stalled (of 75)", "exact harm / sum of single harms", series, logy=True, hline=1.0)


if __name__ == "__main__":
    main()
