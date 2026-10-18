"""Write experiments/saving_by_hdd.svg: saving of the cost-optimal package over the baseline against heating degree-days, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "C. saving", 0, [1, 2])
    write_lines(HERE, "saving_by_hdd.svg", "Cost-optimal envelope: 30-year saving over the baseline, by heating degree-days",
                "Line plot of the 30-year net present cost saving of the cost-optimal envelope over the house-energy baseline against heating degree-days at 500 cooling degree-days; the saving dips near 3,000 to 4,000 degree-days for both heating systems, then rises, faster with a heat pump",
                "heating degree-days (base 65 F), CDD fixed at 500", "saving, USD",
                [("gas furnace + AC", xs, ys[0]), ("heat pump", xs, ys[1])])


main()
