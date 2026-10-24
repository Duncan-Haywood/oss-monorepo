"""Write experiments/years.svg: zero-emission system cost by weather year, tank and cavern, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

SERIES = [("tank", "steel hydrogen tank"), ("cavern", "underground (cavern) hydrogen")]


def main():
    rows = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        name = l.split()[0].rstrip(":")
        year, h2, cap = name.split("_")
        if cap == "cap0.0":
            kv = dict(t.split("=") for t in l.split()[1:])
            rows.setdefault(h2, []).append((int(year), float(kv["cost_per_mwh"])))
    series = [(label, *map(list, zip(*sorted(rows[k])))) for k, label in SERIES]
    write_lines(HERE, "years.svg", "Zero-emission system cost by weather year, Germany 2015 to 2019 (EUR/MWh)",
                "Line plot: cost of a zero-emission one-node German system for each weather year 2015 to 2019, "
                "with a steel hydrogen tank and with caverns; the tank case swings by about EUR 68/MWh between years, "
                "the cavern case by about EUR 14",
                "weather year", "EUR/MWh", series)


if __name__ == "__main__":
    main()
