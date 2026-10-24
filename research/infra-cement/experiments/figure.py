"""Write experiments/saving.svg: CO2 saving of the lowest-clinker LC3 that keeps class 42.5, from section E of results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "E. ", 0, [2], maxrows=5, sep="|")
    write_lines(HERE, "saving.svg", "CO2 saving of LC3 that keeps strength class 42.5",
                "Line plot: kg CO2 per tonne of cement of an LC3 cement at the lowest clinker content that keeps class 42.5, against the 28-day strength of the OPC reference in MPa",
                "28-day strength of the OPC reference, MPa", "kg CO2 per tonne of cement",
                [("LC3 at lowest clinker keeping 42.5", xs, ys[0])])


if __name__ == "__main__":
    main()
