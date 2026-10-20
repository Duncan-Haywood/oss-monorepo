"""Write experiments/league_cost.svg: evaluation cost of a larger verifier league, with and without elimination.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (the E5 block), never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    n, ev, noel = [], [], []
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"\s*n=\s*(\d+):.*eval cost\s+([\d.]+)\s+no-elimination cost\s+([\d.]+)", l)
        if m:
            n.append(float(m.group(1)))
            ev.append(float(m.group(2)))
            noel.append(float(m.group(3)))
    if not n:
        raise SystemExit("no E5 rows parsed from results.txt")
    write_lines(HERE, "league_cost.svg", "Verifier league: evaluation cost against league size",
                "Line plot of total evaluation cost against the number of verifiers in the league; "
                "with elimination the cost grows slowly, without it the cost grows much faster",
                "verifiers in the league n", "evaluation cost (simulated runs)",
                [("with elimination", n, ev), ("no elimination", n, noel)])


if __name__ == "__main__":
    main()
