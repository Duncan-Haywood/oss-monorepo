"""Write experiments/breakeven_vs_rate.svg: whole-package break-even extra first cost against the real discount rate, parsed from results.txt.

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
    xs, ys = table(TEXT, "E. Whole-package break-even", 0, [1, 2, 3, 4])
    names = ["Houston (2A)", "Baltimore (4A)", "Chicago (5A)", "Minneapolis (6A)"]
    write_lines(HERE, "breakeven_vs_rate.svg", "Extra first cost the tight ADU envelope can carry (heat pump)",
                "Line plot of the break-even extra first cost in dollars of the tight envelope against the real discount rate, for four climates; every line falls as the rate rises and colder climates sit higher",
                "real discount rate", "break-even extra first cost (USD)", list(zip(names, [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
