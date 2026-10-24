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
NAMES = ["random", "TPE", "screen k=4", "screen k=6", "screen k=8", "free objectives only", "oracle cells"]


def main():
    xs, ys = table(TEXT, "== H. mean hypervolume", 0, list(range(1, 8)))
    write_lines(HERE, "screen_hv.svg", "Surrogate screen against random and TPE at equal syntheses",
                "Line plot of the mean fraction of the true Pareto-front hypervolume found against the number of Yosys syntheses (4 to 30) for random search, TPE, three surrogate screens, a screen with free objectives only and an oracle; the screens reach 0.98 or more by 12 syntheses while random reaches 0.86",
                "Yosys syntheses (cell counts measured)", "hypervolume found / true",
                list(zip(NAMES, [xs] * 7, ys)))


if __name__ == "__main__":
    main()
