"""Write harm_model.svg: measured harm of a one-segment stall by position against the schedule-only model c P_seg(j),
for the two schedules where position and harm part ways most (warmup-cosine and SGDR).

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "Harm by segment, measured and model", 0, [5, 6, 7, 8])
    names = ["warmup-cosine", "its model", "SGDR", "its model "]
    series = list(zip(names, [xs] * 4, ys))
    write_lines(HERE, "harm_model.svg", "The segment's learning rate predicts a stall's harm (40 seeds, no refit)",
                "Line plot of held-out loss added by stalling one 20-step segment, by segment position, for the"
                " warmup-cosine and SGDR schedules, measured and predicted as 2.66e-4 times the segment's summed"
                " learning rate: the predictions track the warmup, the peak, the trough at the end of the first SGDR"
                " cycle and the restart",
                "segment (of 75, 20 steps each)", "held-out loss added", series)


if __name__ == "__main__":
    main()
