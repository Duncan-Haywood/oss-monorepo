"""Write experiments/peak.svg: the lowest feasible pumping peak against the demand multiplier, from results_threshold.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows = [[c.strip() for c in l.split("|")] for l in (HERE / "results_threshold.txt").read_text().splitlines()
            if l.count("|") == 3 and l[0].isdigit() and "none" not in l]
    xs = [float(r[0]) for r in rows]
    write_lines(HERE, "peak.svg", "Lowest feasible pumping peak against the day's demand (Net3, one-run schedules)",
                "Line plot: the lowest peak kW over all feasible one-run pump-10 schedules as every Net3 demand is scaled from 0.9 to 1.2 times; "
                "it jumps from about 63 kW to 310 kW, the booster pump, with a few percent more demand",
                "demand multiplier (1 = Net3 as shipped)", "lowest feasible peak, kW", [("lowest feasible peak", xs, [float(r[2]) for r in rows])])


if __name__ == "__main__":
    main()
