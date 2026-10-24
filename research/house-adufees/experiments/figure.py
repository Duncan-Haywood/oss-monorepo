"""Write experiments/sdc_vs_area.svg: Denver Water's 2026 house charge against the charged area, with the flat ADU charge, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2])
    write_lines(HERE, "sdc_vs_area.svg", "Denver Water tap fee: house against ADU (July 2026, inside Denver)",
                "Line plot of the Denver Water system development charge in dollars against the charged area in square feet: the house charge rises about a dollar per square foot from 3,885 dollars, the ADU charge is flat at 2,170 dollars",
                "charged area (sq ft)", "tap fee (USD)", list(zip(["house", "ADU"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
