"""Write experiments/ratio.svg: pipelined fleet cost over inline fleet cost against farm size, parsed from results.txt (Sweep 2).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "# Sweep 2", 1, [8])
    n = len(xs) // 3
    series = [(f"{ha} ha fields", xs[i * n:(i + 1) * n], ys[0][i * n:(i + 1) * n]) for i, ha in enumerate(("0.18", "0.72", "1.62"))]
    write_lines(HERE, "ratio.svg", "Pipelined scout fleet cost over inline fleet cost (assumed prices)",
                "Line plot of the cost ratio of one scout with one treater to the cheapest inline fleet, by number of fields, for three field sizes; the ratio falls below 1 only for 1.62 hectare fields once there are about four fields or more",
                "fields on the farm (log scale)", "pipeline USD over inline USD", series, logx=True, hline=1.0)


if __name__ == "__main__":
    main()
