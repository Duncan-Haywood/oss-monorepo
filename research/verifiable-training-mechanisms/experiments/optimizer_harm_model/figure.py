"""Write adam_counter.svg: under Adam (mean lr 1e-3, warmup-cosine), the held-out loss a one-segment stall adds, by
position, when the stall keeps Adam's bias-correction counter on the global step and when it freezes the counter,
against the schedule model (segment learning rate, scaled to the frozen-counter profile's sum).

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "Adam at mean lr 1e-3, harm by segment", 0, [4, 5, 6])
    names = ["counter on global step", "counter frozen by the stall", "schedule model"]
    write_lines(HERE, "adam_counter.svg",
                "Adam: the stall's harm follows the schedule only if the counter is frozen (40 seeds)",
                "Line plot of held-out loss added by stalling one 20-step segment of Adam training under warmup-cosine,"
                " by segment position. With the bias-correction counter kept on the global step, stalls during warmup"
                " lower the loss and the profile departs from the schedule; with the counter frozen the harm tracks the"
                " segment's learning rate",
                "segment (of 75, 20 steps each)", "held-out loss added", list(zip(names, [xs] * 3, ys)))


if __name__ == "__main__":
    main()
