"""Write experiments/tolerance_cliff.svg: valid assembly orders against print tolerance, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

ROW = re.compile(r"^tol ([\d.]+): valid orders (\d+),")


def main():
    on, xs, ys = False, [], []
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== Tolerance sweep"):
            on = True
        elif on and l.startswith("=="):
            break
        elif on and (m := ROW.match(l)):
            xs.append(float(m[1]))
            ys.append(float(m[2]))
    if not xs:
        raise SystemExit("no tolerance-sweep rows parsed")
    write_lines(HERE, "tolerance_cliff.svg", "Robot-cell assembly: valid orders vs print tolerance (L1)",
                "Line plot of the number of valid assembly orders against the tolerance by which the moving part is inflated; "
                "the count is flat until a tolerance of 0.5 mm and then drops to zero",
                "print tolerance inflating the moving part (mm)", "valid assembly orders (of 11!)",
                [("valid orders", xs, ys)])


if __name__ == "__main__":
    main()
