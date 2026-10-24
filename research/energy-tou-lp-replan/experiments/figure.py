"""Write experiments/replan.svg: Golden CO saving against re-plan interval, from section A of results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()
STEPS = [float(t[4:]) for t in next(l for l in LINES if l.startswith("site forecast")).split()[2:]]


def row(site, kind):
    return [float(v) for v in next(l for l in LINES if l.startswith(f"{site} {kind} ")).split()[2:]]


def main():
    site = "golden-co"
    write_lines(HERE, "replan.svg", "Re-planning the home battery on real weather (Golden CO): saving by re-plan interval",
                "Line plot: annual saving over no battery in dollars against the interval in hours between re-plans, on a measured-derived typical year for Golden, Colorado, "
                "for an optimiser fed yesterday's weather, a clear-sky-index forecast, a clear-sky-index forecast with a nowcast of the last sunlit hours, and a perfect forecast",
                "hours between re-plans (24 = once a day)", "saving $/yr over no battery",
                [("yesterday's weather", STEPS, row(site, "persistence")), ("clear-sky index", STEPS, row(site, "smart")),
                 ("index + nowcast", STEPS, row(site, "nowcast")), ("perfect forecast", STEPS, row(site, "perfect"))])


if __name__ == "__main__":
    main()
