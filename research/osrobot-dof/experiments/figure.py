"""Write experiments/tip_mass.svg: operational-space tip mass against joint count, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
xs, ys = table(TEXT, "# Sweep 1", 0, [1])
write_lines(HERE, "tip_mass.svg", "Planar feeding arm: tip mass against joint count",
            "Line plot of the effective mass at the spoon tip along the approach direction for planar arms with 2 to 6 joints; it falls slightly from 0.63 to 0.50 kilograms",
            "joints", "tip mass along approach (kg)", [("tip mass", xs, ys[0])])
