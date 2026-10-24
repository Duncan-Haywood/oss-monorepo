"""Write experiments/size_vs_design_temp.svg: selected heat pump size for the baseline and tight envelope against the winter design temperature (Chicago), parsed from results.txt.

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
    xs, ys = table(TEXT, "F. Credit and size", 0, [1, 2])
    write_lines(HERE, "size_vs_design_temp.svg", "Heat pump size the ADU needs (Chicago, assumed catalogue)",
                "Line plot of the selected heat pump rated capacity in kBtu per hour against the assumed winter design temperature, for the baseline and the tight envelope; the tight envelope is one or two catalogue steps smaller everywhere",
                "winter design temperature (F)", "selected size (kBtu/h)", list(zip(["baseline", "tight"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
