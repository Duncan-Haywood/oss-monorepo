"""Write experiments/cop.svg: the air-source COP against outdoor temperature for three sink temperatures (first block of results.txt).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES[:8], "# COP curve", 0, [1, 2, 3])
    series = [("%d C sink" % s, xs, y) for s, y in zip((35, 45, 55), ys)]
    write_lines(HERE, "cop.svg", "Air-source heat-pump COP against outdoor temperature (Staffell et al. 2012 fit)",
                "Line plot: coefficient of performance of an air-source heat pump against outdoor air temperature, "
                "for sink temperatures of 35, 45 and 55 degrees Celsius",
                "outdoor air temperature (C)", "COP (heat out / electricity in)", series)


if __name__ == "__main__":
    main()
