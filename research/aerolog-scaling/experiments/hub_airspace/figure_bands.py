"""Write band_cost.svg: median conflict weight left (F_k / F_1) against transit time per layer, from band_cost_results.txt.

    python3 figure_bands.py

Numbers are parsed from the committed results file, never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "band_cost_results.txt").read_text().splitlines()


def main():
    series = []
    for m in (12, 16):
        xs, ys = table(TEXT, "## M = %d: median F_k / F_1 by tau" % m, 0, [3, 5], maxrows=5)
        series += [("4 bands, %d operators" % m, xs, ys[0]), ("best number, %d operators" % m, xs, ys[1])]
    write_lines(HERE, "band_cost.svg", "Drone altitude bands with climb and descent charged",
                "Line plot of the median share of conflict weight left against seconds per layer spent climbing or "
                "descending: with 4 bands it rises from 0.17 at 0 s to 0.63 at 20 s for 12 operators, and the best "
                "number of bands is barely better than 4",
                "transit time per layer (s)", "conflict weight left / single band", series)


if __name__ == "__main__":
    main()
