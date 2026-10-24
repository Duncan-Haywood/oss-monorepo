"""Write experiments/cost.svg: system cost against the emissions cut, from group A of results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

SERIES = [("head_2030_tank", "2030 costs (2025 EUR), steel tank"),
          ("head_2030_cavern", "2030 costs (2025 EUR), cavern"),
          ("v092_2030_cavern", "2030 costs (v0.9.2), cavern"),
          ("v092_2050_cavern", "2050 costs (v0.9.2), cavern")]


def main():
    rows = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("A "):
            name = l.split()[1].rstrip(":")
            key, cap = name.rsplit("_cap", 1)
            kv = dict(t.split("=") for t in l.split()[2:])
            rows.setdefault(key, []).append((100 * (1 - float(cap)), float(kv["cost_per_mwh"])))
    series = [(label, *map(list, zip(*sorted(rows[k])))) for k, label in SERIES]
    write_lines(HERE, "cost.svg", "Least-cost system, sourced costs: EUR/MWh against emissions cut (Germany 2019)",
                "Line plot: system cost per MWh against the emissions cut for four sourced cost sets; the last "
                "5% of the cut dominates, most with a steel hydrogen tank and least with underground storage",
                "emissions cut vs all-gas (%)", "EUR/MWh", series)


if __name__ == "__main__":
    main()
