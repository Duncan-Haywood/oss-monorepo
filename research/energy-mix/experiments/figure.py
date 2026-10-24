"""Write experiments/cost.svg: system cost against the emissions cap, from group A of results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows = []
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("A "):
            kv = dict(t.split("=") for t in l.split()[2:])
            rows.append((100 * (1 - float(kv["emissions_frac"])), float(kv["cost_per_mwh"]),
                         float(kv["h2_gwh"]) / 1e3))
    rows.sort()
    write_lines(HERE, "cost.svg", "Least-cost system: $/MWh against emissions cut (Germany 2019 hourly)",
                "Line plot: cost per MWh of a least-cost solar, wind, gas and storage system rises slowly to a 50% "
                "cut, then steeply, reaching about 2.2 times the gas-only cost at a 100% cut",
                "emissions cut vs all-gas (%)", "$/MWh (assumed costs)",
                [("system cost", [r[0] for r in rows], [r[1] for r in rows])])


if __name__ == "__main__":
    main()
