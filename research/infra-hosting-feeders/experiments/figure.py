"""Write experiments/hosting.svg: median PV hosting capacity by measure on the IEEE 123-node feeder, from results.txt.
python experiments/figure.py"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def medians(header_prefix, section):
    """Medians (kW) of section A's rows for the feeder whose header starts with header_prefix: {load level: [baseline, ...]}."""
    i = next(k for k, ln in enumerate(LINES) if ln.startswith(header_prefix))
    j = next(k for k in range(i, len(LINES)) if LINES[k].startswith(section))
    rows = {}
    for ln in LINES[j + 2:j + 4]:
        lvl, rest = ln.split(" ", 1)
        rows[float(lvl)] = [float(m) for m in re.findall(r"(\d+) \[", rest)]
    return rows


def main():
    series = []
    names = ["baseline", "fixed pf 0.95", "volt-var", "regulator -2 V", "volt-var + reg -2 V"]
    rows = medians("=== IEEE 123", "A. ")
    xs = sorted(rows)
    for k, n in enumerate(names[:4]):
        series.append((n, xs, [rows[x][k] for x in xs]))
    write_lines(HERE, "hosting.svg", "IEEE 123-node feeder: median PV hosting capacity (200 placements)",
                "Line plot: median rooftop PV hosting capacity in kilowatts of the IEEE 123-node "
                "feeder at two load levels, for no measure, a fixed power factor, volt-var and a lower regulator set-point",
                "load level (fraction of peak)", "median hosting capacity, kW", series)


if __name__ == "__main__":
    main()
