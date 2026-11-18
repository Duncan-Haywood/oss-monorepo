"""Write pressure_ref.svg: the tail P(|delta| > x) of the sourced barometric reference mismatch (NOAA ISD 2014, NYC)
for a stale setting at JFK (S1) and a stale JFK setting used near LaGuardia (S2), each against a Gaussian of the same
sd, from pressure_mismatch_samples.json (written by pressure_stats.py).

    python3 figure_pressure.py
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

D = json.loads((HERE / "pressure_mismatch_samples.json").read_text())
XS = [0.5 * i for i in range(0, 37)]


def tail(key):
    c, w = D[key]["centres"], D[key]["counts"]
    n = sum(w)
    return [max(sum(b for a, b in zip(c, w) if abs(a) > x) / n, 1e-6) for x in XS]


def gauss(sd):
    pts = [(x, math.erfc(x / (sd * math.sqrt(2.0)))) for x in XS]
    pts = [p for p in pts if p[1] >= 1e-5]
    return [p[0] for p in pts], [p[1] for p in pts]


def main():
    s1, s2 = D["S1_JFK"]["sd"], D["S2_JFK_LGA"]["sd"]
    series = [("S1 stale JFK (%.1f m)" % s1, XS, tail("S1_JFK")),
              ("Gaussian %.1f m" % s1,) + gauss(s1),
              ("S2 JFK near LGA (%.1f m)" % s2, XS, tail("S2_JFK_LGA")),
              ("Gaussian %.1f m" % s2,) + gauss(s2)]
    write_lines(HERE, "pressure_ref.svg", "Barometric reference mismatch in New York, 2014 (NOAA ISD)",
                "Log-scale line plot of the probability that the altitude mismatch between a barometric drone using the "
                "latest airport altimeter setting and the true pressure altitude exceeds x metres, for a stale JFK "
                "setting and for the JFK setting used near LaGuardia, each against a Gaussian with the same standard "
                "deviation; the measured curves have heavier tails",
                "mismatch x (m)", "P(|delta| > x)", series, logy=True)


if __name__ == "__main__":
    main()
