"""Write experiments/error_vs_span.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

KEYS = "clean_ba cauchy ri_cauchy g_tri g_linear g_cauchy recall lost cover".split()


def sections():
    out, cur = {}, None
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== "):
            cur = float(l.split("ratio test ")[1].split(",")[0])
            out[cur] = []
        elif cur is not None and l[:4].strip().isdigit():
            p = l.split()
            out[cur].append((int(p[0]), dict(zip(KEYS, map(float, p[1:])))))
    return out


def main():
    s = sections()
    r = 0.8
    rows = s[r]
    xs = [a for a, _ in rows]
    g = lambda k: [b[k] for _, b in rows]
    write_lines(HERE, "error_vs_span.svg", f"Surface error as mismatches repeat over more views (ratio test {r})",
                "Line plot of mean surface error against the number of consecutive views in which a bad feature is wrong by the same offset, for Cauchy adjustment from the all-view start, from a RANSAC start and after the epipolar gate",
                "views sharing each mismatch (span)", "mean surface error (radii)",
                [("Cauchy, all-view start", xs, g("cauchy")), ("Cauchy, RANSAC start", xs, g("ri_cauchy")),
                 ("gate + Cauchy", xs, g("g_cauchy")), ("clean floor", xs, g("clean_ba"))], logy=True)


if __name__ == "__main__":
    main()
