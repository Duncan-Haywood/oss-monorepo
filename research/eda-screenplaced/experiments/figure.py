"""Write experiments/screenplaced_hv.svg: hypervolume found against placements, pooled over the four families.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
COLS = {"random": 1, "screen, area and period models from other families": 2, "screen, no models (constant)": 4}


def main():
    xs, ys = table(TEXT, "== P.", 0, list(COLS.values()))
    series = [(n, xs, y) for n, y in zip(COLS, ys)]
    write_lines(HERE, "screenplaced_hv.svg", "Screening the placed area-period front with cross-family models",
                "Line plot of the mean fraction of the true placed area-period front's hypervolume against the number of placements; a screen with cost models trained on other families reaches 1.0 by 5 placements while random search and a screen with no models reach about 0.71 to 0.67",
                "placements of the new family", "fraction of true hypervolume (mean, four families)", series)


if __name__ == "__main__":
    main()
