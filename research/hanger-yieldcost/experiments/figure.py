"""Write experiments/yieldcost.svg: paired gain of a yield threshold over current-pick avoidance, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    series = []
    for name in ("pinch", "sweep", "see"):
        for sep in ("0.15", "0.30", "0.45"):
            rows = [l.split() for l in TEXT[2:] if l.startswith(name + " ") and l.split()[1] == sep and l.split()[2] != "-inf"]
            series.append(("%s, %s m" % (name, sep), [float(r[2]) for r in rows], [float(r[5]) for r in rows]))
    write_lines(HERE, "yieldcost.svg",
                "Does yielding only to long clashes help?",
                "Line plot of the paired change in garments per hour from yielding to the other arm's predicted next pick only when the predicted overlap is at least tau seconds, against tau, for three policies and three clearances",
                "yield only if predicted overlap >= tau (s)", "yield minus avoid (garments per hour)", series)


if __name__ == "__main__":
    main()
