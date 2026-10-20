"""Write experiments/agreement_vs_mu.svg: L1 rule vs MuJoCo settle agreement against friction, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import num, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def block(start, stop=None):
    on, rows = False, []
    for l in LINES:
        if l.startswith(start):
            on = True
        elif on and stop and l.startswith(stop):
            break
        elif on:
            p = l.split()
            if len(p) >= 4 and all(num(t) is not None for t in p[:3] + p[-1:]):
                rows.append(p)
    return rows


def series(rows, disp, tilt, name):
    pts = [(float(p[0]), float(p[-1])) for p in rows if float(p[1]) == disp and float(p[2]) == tilt]
    return name, [x for x, _ in pts], [y for _, y in pts]


def main():
    base = block("Confusion on L0-reachable", "Same, with the acyclic")
    acyc = block("Same, with the acyclic", "Disagreements")
    s = [series(base, 3.0, 3.0, "L1 rule, 3 deg"), series(base, 3.0, 10.0, "L1 rule, 10 deg"),
         series(acyc, 3.0, 3.0, "acyclic rule, 3 deg"), series(acyc, 3.0, 10.0, "acyclic rule, 10 deg")]
    write_lines(HERE, "agreement_vs_mu.svg", "Robofab settle: rule vs MuJoCo agreement (3 mm threshold)",
                "Line plot of agreement between the geometric stability rule and a MuJoCo settle test against friction coefficient; agreement is flat in friction and higher for the acyclic-support variant",
                "friction coefficient mu", "agreement", s)


if __name__ == "__main__":
    main()
