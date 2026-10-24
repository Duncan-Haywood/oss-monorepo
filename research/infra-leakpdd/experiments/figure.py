"""Write experiments/pdd.svg from results.txt: share of junction-hours below 15 m, DD vs PDD, by demand multiplier.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    block = (HERE / "results.txt").read_text().split("== A.")[1].split("== B.")[0]
    rows = [l.split("|") for l in block.splitlines() if l and l[0].isdigit()]
    x = [float(r[0]) for r in rows]
    neg = [float(r[1].split()[0]) for r in rows]
    dd = [float(r[1].split()[1]) for r in rows]
    pdd = [float(r[2].split()[0]) for r in rows]
    write_lines(HERE, "pdd.svg", "Where Net3 stops being a believable hydraulic model as demand grows",
                "Line plot: share of junction-hours below 15 m pressure, and below 0 m in the demand-driven run, against the demand multiplier, for demand-driven and pressure-driven simulation",
                "demand multiplier (x Net3 base demand)", "share of junction-hours",
                [("DD below 0 m", x, neg), ("DD below 15 m", x, dd), ("PDD below 15 m", x, pdd)])


if __name__ == "__main__":
    main()
