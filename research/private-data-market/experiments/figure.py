"""Write experiments/cliff.svg: the best added noise as kappa*a approaches 1, parsed from results.txt (E3).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    xs, ys = [], []
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"\s*kappa\*a=([\d.]+): closed-form noise ([\d.]+);", l)
        if m:
            xs.append(float(m.group(1)))
            ys.append(float(m.group(2)))
    if not xs:
        raise SystemExit("no E3 rows parsed")
    write_lines(HERE, "cliff.svg", "Best noise to add blows up as kappa*a nears 1",
                "Line plot of the closed-form best noise variance against kappa times a; it rises from 3 at 0.5 to 239 at 0.99, and at 1.0 and above the rule says stay out",
                "kappa * a (log scale)", "closed-form best noise (log scale)",
                [("closed-form noise", xs, ys)], logx=True, logy=True)


if __name__ == "__main__":
    main()
