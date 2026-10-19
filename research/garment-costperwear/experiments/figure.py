"""Write experiments/prob_vs_lifetime.svg: P(designer coat cheaper per wear) against its median lifetime.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    on, ser = False, {}
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== B."):
            on = True
        elif l.startswith("==") and on:
            break
        p = l.split()
        if on and len(p) == 3 and p[0] in ("trench", "coat"):
            xs, ys = ser.setdefault(p[0], ([], []))
            xs.append(float(p[1]))
            ys.append(float(p[2]))
    series = [(k, xs, ys) for k, (xs, ys) in ser.items()]
    write_lines(HERE, "prob_vs_lifetime.svg", "P(designer coat cheaper per wear) vs its median lifetime",
                "Line plot: the probability that a designer coat has a lower cost per wear than a replica rises from zero at 300 median wears to about 0.95 at 10,000 wears",
                "designer median lifetime (wears, log scale)", "probability", series, logx=True, hline=0.5)


if __name__ == "__main__":
    main()
