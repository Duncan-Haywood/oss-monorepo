"""Write experiments/screenxfer_hv.svg: hypervolume found against syntheses, pooled over mac and fir.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
COLS = {"random": 1, "free objectives only (lowest cycles first)": 3, "cost model trained on other families": 4, "same, refit on measured designs": 6}


def main():
    xs, ys = table(TEXT, "== P.", 0, list(COLS.values()))
    series = [(n, xs, y) for n, y in zip(COLS, ys)]
    write_lines(HERE, "screenxfer_hv.svg", "Pareto screen with a cost model trained on other families",
                "Line plot of the mean fraction of the true front's hypervolume against the number of syntheses on a new design family; a screen using a cost model trained only on other families reaches about 0.99 by 4 syntheses while random search needs 20 to reach 0.96",
                "syntheses of the new family", "fraction of true hypervolume (mean, mac and fir)", series)


if __name__ == "__main__":
    main()
