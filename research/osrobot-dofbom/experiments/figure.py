"""Write experiments/bom.svg: full bill of materials against joint count for three servo prices, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
xs, ys = table(TEXT, "# Sweep 5", 0, [1, 2, 3])
write_lines(HERE, "bom.svg", "Feeding arm: full bill of materials against joint count",
            "Line plot of the total parts cost of a planar feeding arm with 2 to 6 joints at three servo prices, rising from about 66 to 122 dollars at the cheapest servo and 137 to 334 dollars at the dearest",
            "joints", "full bill of materials (USD)",
            [("Alibaba $13.89 servo", xs, ys[0]), ("AIFit $26.00", xs, ys[1]), ("RobotShop $49.22", xs, ys[2])])
