"""Write experiments/saving.svg: saving of the full-bill optimum against the shipped schedule by demand-charge multiplier, from results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    block = (HERE / "results.txt").read_text().split("== E.")[1].split("== D.")[0]
    rows = [[c.strip() for c in l.split("|")] for l in block.splitlines() if l.count("|") == 4 and l.startswith("x")]
    xs = [float(r[0][1:]) for r in rows]
    write_lines(HERE, "saving.svg", "Summer bill saved by the best pump-10 schedule vs the shipped one (Net3, PG&E B-19)",
                "Line plot: percent of the monthly summer pumping bill saved by the bill-minimising schedule against the shipped 01:00 to 15:00 schedule, "
                "as the B-19 demand charges are scaled from 0 to 20 times",
                "demand-charge multiplier (1 = published rate)", "bill saved, %", [("full-bill optimum", xs, [float(r[4]) for r in rows])])


if __name__ == "__main__":
    main()
