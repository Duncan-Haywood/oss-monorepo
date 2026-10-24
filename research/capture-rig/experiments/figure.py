"""Write experiments/baseline.svg: triangulation error against convergence angle for a camera pair, parsed from results.txt.

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
    xs, ys = table(TEXT, "C. Two cameras", 0, [2])
    if len(xs) < 5:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "baseline.svg", "Two-camera triangulation error against convergence angle",
                "Line plot: centre triangulation error in millimetres falls from 7.3 mm at 5 degrees of convergence to 0.64 mm at 90 degrees, at 3 m",
                "convergence angle between the two cameras (deg)", "error at subject (mm, idealised)",
                [("camera pair at 3 m", xs, ys[0])], logx=True, logy=True)


if __name__ == "__main__":
    main()
