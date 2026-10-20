"""Write experiments/cooling_need_vs_shgc.svg: Houston's required cooling capacity against window SHGC, parsed from results.txt.

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
    xs, ys = table(TEXT, "G. Required rated cooling", 0, [1, 2])
    write_lines(HERE, "cooling_need_vs_shgc.svg", "Cooling capacity the ADU needs against window SHGC (Houston, assumed inputs)",
                "Line plot of the required rated cooling capacity in kBtu per hour against window solar heat gain coefficient, for the baseline and the tight envelope; both rise with SHGC and the tight envelope needs about 1.5 kBtu per hour less",
                "window SHGC", "required cooling capacity (kBtu/h)", list(zip(["baseline", "tight"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
