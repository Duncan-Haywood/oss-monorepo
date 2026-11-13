"""Write qp_profile.svg: the criterion over q_P at q_N = 0.05 and 0.10, parsed from twostep.txt.

python3 experiments/m1_reproduce/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    series = []
    for line in (HERE / "twostep.txt").read_text().splitlines():
        m = re.match(r"\s*profile Q/Q_min over qP at qN = ([0-9.]+): (.*)", line)
        if m:
            pts = [tuple(map(float, t.split(":"))) for t in m.group(2).split()]
            series.append((f"qN = {m.group(1)}", [p[0] for p in pts], [p[1] for p in pts]))
    write_lines(HERE, "qp_profile.svg",
                "Banerjee et al. (2013) information model: fit criterion over qP",
                "Line plot of the moment criterion relative to its minimum against qP; at qN = 0.05 it "
                "bottoms out at qP 0.30 to 0.35 and is flat-ish from 0.25 to 0.45; at qN = 0.10, the "
                "published estimate, it is 2 to 16 times the minimum everywhere",
                "qP (chance an adopter tells a neighbour per period)", "criterion / minimum",
                series, logy=True, hline=1.0)


if __name__ == "__main__":
    main()
