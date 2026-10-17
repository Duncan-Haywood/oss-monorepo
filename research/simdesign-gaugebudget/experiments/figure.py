"""Write experiments/mass_vs_gauge.svg: best feasible bracket mass against sheet gauge, for the larger search budget (min over seeds).

    python experiments/figure.py

Parsed from the committed results.txt ("budget big", the rules block), never retyped. Gauges that were never feasible are skipped.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

ROW = re.compile(r"^gauge ([\d.]+): ([\d.]+) \.\. ([\d.]+) g")


def main():
    text = (HERE / "results.txt").read_text()
    block = text.split("== budget big")[1].split("-- free")[0]
    rows = [tuple(map(float, m.groups())) for m in map(ROW.match, block.splitlines()) if m]
    xs = [r[0] for r in rows]
    series = [("best seed", xs, [r[1] for r in rows]), ("worst seed", xs, [r[2] for r in rows])]
    write_lines(HERE, "mass_vs_gauge.svg",
                "Laser-cut bracket: best feasible mass by sheet gauge (larger budget)",
                "Line plot of the lightest feasible bracket mass in grams against steel sheet gauge in millimetres; mass rises steeply for thick sheets "
                "and gauges below 2 mm are never feasible",
                "sheet gauge (mm)", "mass (g)", series)


if __name__ == "__main__":
    main()
