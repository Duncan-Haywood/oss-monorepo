"""Write experiments/diameter_vs_accel.svg: rod diameter needed for an acceleration, parsed from results.txt.

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
    xs, ys = table(TEXT, "== smallest diameter", 0, [1, 2, 3])
    series = [(n, xs, y) for n, y in zip(["steel", "aluminium", "hardwood"], ys)]
    write_lines(HERE, "diameter_vs_accel.svg", "Rod diameter for a ringing budget (abrupt steps, stylised)",
                "Line plot of the rod diameter in millimetres that keeps residual ringing under 50 micrometres, against carriage acceleration, for steel, aluminium and hardwood rods; hardwood needs the thickest rod",
                "acceleration (m/s^2)", "smallest rod diameter (mm)", series)


if __name__ == "__main__":
    main()
