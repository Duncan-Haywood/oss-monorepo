"""Write experiments/lookahead.svg: paired gain of lookahead over current-pick avoidance, from results.txt.

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
        for window in ("inf", "15"):
            rows = [l.split() for l in TEXT[2:] if l.startswith(name + " ") and l.split()[2] == window]
            series.append(("%s, window %s s" % (name, window), [float(r[1]) for r in rows], [float(r[6]) for r in rows]))
    write_lines(HERE, "lookahead.svg",
                "Does steering clear of the other arm's next pick help?",
                "Line plot of the paired change in garments per hour from adding lookahead to avoidance, against the clearance in metres, for pinching, sweeping and aiming with a 15 s or unlimited window: almost always zero or negative, down to about minus 11 for aiming at 0.15 m with an unlimited window",
                "clearance needed between two grasps (m, assumed)", "lookahead minus avoid (garments per hour)", series)


if __name__ == "__main__":
    main()
