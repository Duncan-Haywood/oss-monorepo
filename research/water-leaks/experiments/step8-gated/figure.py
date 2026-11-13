"""Write experiments/step8-gated/gated_chance.svg: each detector's P(chance >= its 2019 count) against phi.

    python experiments/step8-gated/figure.py   # from research/water-leaks; reads results.txt

Numbers are parsed from the committed results.txt. A P of 0.000 (none of 1,000 draws) is drawn at 0.0005.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

SHOW = ["D1-F", "LILA-auto", "M3", "M4"]


def main():
    text = (HERE / "results.txt").read_text()
    pts = {k: ([], []) for k in SHOW}
    for blk in re.split(r"^## phi = ", text, flags=re.M)[1:]:
        phi = float(blk.split(" ", 1)[0])
        for k in SHOW:
            m = re.search(rf"^\s+{re.escape(k)}\s+\d+ \|.*?\)\s+([\d.]+) \|", blk, re.M)
            pts[k][0].append(phi)
            pts[k][1].append(max(float(m.group(1)), 0.0005))
    series = [(k, xs, ys) for k, (xs, ys) in pts.items()]
    write_lines(HERE, "gated_chance.svg", "BattLeDIM 2019: detection count against chance, by match gate",
                "Line plot of the probability that random alarms score at least each detector's 2019 detection count, "
                "against the flow gate phi; D1-F is never below 0.05, the night-flow M3 is below 0.005 at every phi above 0",
                "gate phi (m3/h of leak flow before an alarm can count; 0 = ungated)", "P(chance >= detections)",
                series, logy=True, hline=0.05)


if __name__ == "__main__":
    main()
