"""Write experiments/lcos.svg: LCOS against duration for each technology, from section A of results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "A. ", 0, [1, 2, 3, 4, 5])
    names = ["li-ion", "vanadium flow", "pumped hydro", "compressed air", "hydrogen"]
    series = [(n, xs, y) for n, y in zip(names, ys)]
    write_lines(HERE, "lcos.svg", "Levelised cost of storage vs duration (assumed inputs)",
                "Line plot: cost per MWh delivered against storage duration in hours for five technologies",
                "storage duration (hours)", "LCOS ($/MWh delivered)", series, logx=True)


if __name__ == "__main__":
    main()
