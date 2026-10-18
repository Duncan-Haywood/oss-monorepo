"""Write experiments/carry_time.svg: total six-part carry time, min-jerk vs time-optimal, against torque limit.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LENGTHS = ("0.08", "0.2")


def totals(text):
    """{(link length, torque limit): (min-jerk total s, time-optimal total s)} from the '## L=..' blocks."""
    out, key = {}, None
    for line in text.splitlines():
        m = re.match(r"## L=([\d.]+) m, torque limit ([\d.]+) N m", line)
        if m:
            key = (m.group(1), float(m.group(2)))
        elif key and line.startswith("total"):
            p = line.split()
            out[key] = (float(p[1]), float(p[2]))
    return out


def main():
    t = totals((HERE / "results.txt").read_text())
    series = []
    for L in LENGTHS:
        taus = sorted(k[1] for k in t if k[0] == L)
        series.append((f"min-jerk, L={L} m", taus, [t[(L, x)][0] for x in taus]))
        series.append((f"time-optimal, L={L} m", taus, [t[(L, x)][1] for x in taus]))
    write_lines(HERE, "carry_time.svg", "Six-part carry time: min-jerk vs time-optimal",
                "Line plot of the total carry time of six parts under a min-jerk trajectory and a time-optimal bang-bang one, "
                "for two link lengths, against the joint torque limit; time-optimal is faster at every point and carry time falls as the torque limit rises",
                "torque limit (N m)", "total carry time (s)", series, logx=True, logy=True)


if __name__ == "__main__":
    main()
