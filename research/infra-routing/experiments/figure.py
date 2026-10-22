"""Write experiments/penalty.svg from section B of results.txt: distance penalty of an electric fleet over the
battery-blind plan against battery range, route-first/charge-second against the charge-aware search.   python experiments/figure.py"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows = []
    for line in (HERE / "results.txt").read_text().splitlines():
        p = [s.strip() for s in line.split("|")]
        if len(p) > 7 and p[0] == "Q":
            m = re.match(r"(-?[\d.]+)% -> (-?[\d.]+)%", p[6])
            rows.append((float(p[1][2:]), float(m.group(1)), float(m.group(2))))
    rows.sort()
    xs = [r[0] for r in rows]
    write_lines(HERE, "penalty.svg", "Distance penalty of an electric fleet on Solomon RC208",
                "Line plot: percent extra distance over the battery-blind plan against battery range, for route-first charge-second and for the charge-aware local search",
                "battery range Q (distance units)", "extra distance, %",
                [("route-first, charge second", xs, [r[1] for r in rows]),
                 ("charge-aware search", xs, [r[2] for r in rows])])


if __name__ == "__main__":
    main()
