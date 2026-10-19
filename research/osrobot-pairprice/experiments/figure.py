"""Write experiments/usd_per_ha.svg: USD per hectare against field size, parsed from results.txt (Sweep 3).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "# Sweep 3", 0, [1, 2, 3])
    names = ["one inline robot", "scout + treater (unheld)", "scout + treater (held)"]
    write_lines(HERE, "usd_per_ha.svg", "Cost per hectare against field size (assumed prices)",
                "Line plot of assumed cost per hectare for one inline weeding robot, a scout plus treater charged by minutes worked, and a pair held for the whole job; the unheld pair crosses below the inline robot near 0.5 hectare",
                "field size (hectares, log scale; 5 and 20 ha extrapolated)", "USD per hectare", list(zip(names, [xs] * 3, ys)),
                logx=True, logy=True)


if __name__ == "__main__":
    main()
