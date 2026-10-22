"""Write experiments/error_vs_rate.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

KEYS = "clean_ba cauchy ri_cauchy g_tri g_linear g_cauchy recall lost cover".split()


def rows(prefix):
    """(rate, {key: value}) for section A rows (no mutual check) whose label starts with `prefix`."""
    out, on = [], False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== A."):
            on = True
        elif l.startswith("=="):
            on = False
        elif on and l.startswith(prefix):
            p = l.split()
            rate = float(p[1].split("/")[1])
            out.append((rate, dict(zip(KEYS, map(float, p[2:])))))
    return sorted(out)


def main():
    m, u = rows("measured"), rows("uniform")
    m, u = [r for r in m if r[0] < 0.5], [r for r in u if r[0] < 0.5]  # drop the no-ratio-test cell
    xs = [r[0] for r in m]
    s = lambda rs, k: [r[1][k] for r in rs]
    write_lines(HERE, "error_vs_rate.svg", "Surface error at the mismatch rates a real matcher gives",
                "Line plot of mean surface error against the mismatch rate for measured SIFT mixes (ratio test 0.9 to 0.6), with Cauchy adjustment from the all-view start, from a RANSAC start and after the epipolar gate, and the all-uniform-pixel assumption",
                "mismatched observations (fraction)", "mean surface error (radii)",
                [("Cauchy, all-view start (measured mix)", xs, s(m, "cauchy")),
                 ("Cauchy, RANSAC start (measured mix)", xs, s(m, "ri_cauchy")),
                 ("gate + Cauchy (measured mix)", xs, s(m, "g_cauchy")),
                 ("Cauchy, all-view start (all uniform)", [r[0] for r in u], s(u, "cauchy"))],
                logy=True)


if __name__ == "__main__":
    main()
