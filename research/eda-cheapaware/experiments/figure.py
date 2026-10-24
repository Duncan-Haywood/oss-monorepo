"""Write experiments/screen_hv.svg: mean hypervolume ratio against syntheses, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["random", "TPE", "cheap-aware random", "screen k=4", "screen k=6", "screen k=8", "free objectives only (ordered)", "oracle cells"]


def main():
    xs, ys = table(TEXT, "== H. mean hypervolume", 0, list(range(1, 9)))
    write_lines(HERE, "cheapaware_hv.svg", "Surrogate screen against random, TPE and a cheap-aware random baseline at equal syntheses",
                "Line plot of the mean fraction of the true Pareto-front hypervolume found against the number of Yosys syntheses (4 to 30) for random search, TPE, a random search that uses the free objectives, three surrogate screens, an ordered free-objectives-only screen and an oracle; the screens reach 0.97 or more by 12 syntheses while cheap-aware random reaches 0.90 and plain random 0.86",
                "Yosys syntheses (cell counts measured)", "hypervolume found / true",
                list(zip(NAMES, [xs] * 8, ys)))


if __name__ == "__main__":
    main()
