"""Write experiments/recall_vs_shift.svg and recall_vs_shift_dark.svg: person recall against thermal-camera displacement.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    for sec, fname, cond in (("## B1.", "recall_vs_shift.svg", "bright light"), ("## B2.", "recall_vs_shift_dark.svg", "darkness")):
        xs, ys = table(TEXT, sec, 0, [1, 2, 3, 4])
        write_lines(HERE, fname, f"Person recall against thermal camera displacement, {cond} (synthetic)",
                    f"Line plot of person recall at 10 percent false alarms per image for RGB only, thermal only, early fusion trained aligned "
                    f"and early fusion trained with displacement jitter, against thermal camera displacement in pixels, in {cond}",
                    "thermal camera displacement (RGB pixels)", "person recall",
                    [("RGB only", xs, ys[0]), ("thermal only", xs, ys[1]), ("fused, trained aligned", xs, ys[2]), ("fused, trained with jitter", xs, ys[3])])


if __name__ == "__main__":
    main()
