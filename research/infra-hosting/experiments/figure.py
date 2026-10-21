"""Write experiments/hosting.svg: median PV hosting capacity against load level, from section F of results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "F. ", 0, [1, 2, 3, 4], maxrows=4)
    names = ["baseline", "fixed pf 0.95", "volt-var", "regulator set-point -2 V"]
    write_lines(HERE, "hosting.svg", "IEEE 13-node feeder: median PV hosting capacity (300 placements)",
                "Line plot: median rooftop PV hosting capacity in kilowatts of the IEEE 13-node feeder against the load level, "
                "for no measure, a fixed power factor, volt-var and a lower regulator set-point",
                "load level (fraction of the feeder's 3466 kW peak)", "median hosting capacity, kW", list(zip(names, [xs] * 4, ys)))


if __name__ == "__main__":
    main()
