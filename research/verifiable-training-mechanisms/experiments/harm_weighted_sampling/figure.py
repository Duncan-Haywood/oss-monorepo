"""Write harm_by_segment.svg: held-out loss harm of stalling one 20-step segment, by position, for three schedules.

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "Harm by segment, all schedules", 0, [1, 2, 3])
    series = list(zip(["cosine", "constant", "warmup-stable-decay"], [xs] * 3, ys))
    write_lines(HERE, "harm_by_segment.svg", "Harm of a one-segment stall by position (40 seeds)",
                "Line plot of the held-out loss added by skipping one 20-step segment, against the segment's position:"
                " under cosine the harm falls from 1.2e-3 at the start to about zero at the end, under a constant"
                " learning rate it stays near 5.3e-4 everywhere, under warmup-stable-decay it is flat then halves"
                " over the cooldown",
                "segment index (20 steps each, 75 in the job)", "held-out loss added", series, hline=0.0)


if __name__ == "__main__":
    main()
