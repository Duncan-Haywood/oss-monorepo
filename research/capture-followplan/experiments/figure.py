"""Write experiments/front.svg: framed time against pedestrian contacts for repulsion gains and planner radii, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rep, plan = [], []
    for ln in (HERE / "results.txt").read_text().splitlines():
        parts = [x.strip() for x in ln.split("|")]
        if len(parts) == 3 and parts[0].startswith(("repulsion gain", "planner radius")):
            (rep if parts[0].startswith("repulsion") else plan).append((float(parts[2]), float(parts[1])))
    if len(rep) < 3 or len(plan) < 3:
        raise SystemExit("no rows parsed")
    rep.sort()
    plan.sort()
    write_lines(HERE, "front.svg", "Framing against pedestrian contacts: repulsion gains and planner radii",
                "Line plot: for a drone at 0.1 people per square metre, the share of time framed against pedestrian contacts per hour, one curve for repulsion with different gains and one for the predictive planner with different safety radii",
                "contacts per hour (within 0.5 m)", "framed time (%)",
                [("repulsion (gain sweep)", [x for x, _ in rep], [y for _, y in rep]),
                 ("predictive planner (radius sweep)", [x for x, _ in plan], [y for _, y in plan])])


if __name__ == "__main__":
    main()
