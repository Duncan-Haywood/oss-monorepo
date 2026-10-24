"""Write experiments/contacts.svg: contacts per hour against detection latency, one curve per noise level, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    curves, exact = {}, None
    for ln in (HERE / "results.txt").read_text().splitlines():
        p = [x.strip() for x in ln.split("|")]
        if len(p) == 3 and p[0].startswith("sigma"):
            _, sig, _, lat = p[0].split()
            curves.setdefault(sig, []).append((float(lat), float(p[2].split()[0])))
    if len(curves) < 3:
        raise SystemExit("no rows parsed")
    series = [(f"sigma {s} m", [x for x, _ in v], [y for _, y in v]) for s, v in curves.items()]
    write_lines(HERE, "contacts.svg", "Pedestrian contacts against detection latency, by detection noise",
                "Line plot: for a drone using the predictive planner at 0.1 people per square metre, contacts per hour against detection latency in seconds, one curve for each detection noise level",
                "detection latency (s)", "contacts per hour (within 0.5 m)", series)


if __name__ == "__main__":
    main()
