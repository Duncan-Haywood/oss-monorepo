"""Write experiments/paired.svg: recall change against plain threshold at 4 false/h, by clustering strength.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().split("== recall at 4.0")[1].splitlines()


def main():
    xs, cols, pe = [], [[], [], []], None
    for l in TEXT:
        m = re.match(r"(0\.\d\d)\s+\S", l)
        if m:
            pe = float(m[1])
        d = re.match(r"\s+paired diff\s+([+-][\d.]+) \(se [\d.]+\)\s+([+-][\d.]+) \(se [\d.]+\)\s+([+-][\d.]+) \(se", l)
        if d and pe is not None:
            xs.append(pe)
            for c, v in zip(cols, d.groups()):
                c.append(float(v))
    if len(xs) != 3:
        raise SystemExit("expected 3 clustering levels, parsed %d" % len(xs))
    series = [(n, xs, c) for n, c in zip(["cooldown", "boost", "backoff"], cols)]
    write_lines(HERE, "paired.svg", "Recall change vs plain threshold at 4 false interruptions/h",
                "Line plot of the change in recall against a plain threshold policy for cooldown, boost and back-off policies as needs cluster more strongly; boost gains, cooldown loses",
                "P(need | episode)  (0.03 = no clustering)", "recall change (paired mean)", series, hline=0)


if __name__ == "__main__":
    main()
