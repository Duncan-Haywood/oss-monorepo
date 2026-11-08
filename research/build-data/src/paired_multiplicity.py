"""Holm and Benjamini-Hochberg correction over the 15 paired neural-minus-boosted cells (committed results only).

Each cell has a 95% week-block bootstrap interval (lo, hi) and a point estimate. The bootstrap draws were
not saved, so an approximate two-sided p comes from a normal approximation: se = (hi - lo) / (2 * 1.96),
z = diff / se. This is an approximation (intervals can be skewed); it is labelled as such in the output.
Usage: python3 src/paired_multiplicity.py [results_dir] [year|all] > results/paired_multiplicity_<year>.txt
(default year 2024; "all" pools every year into one family of 45 cells)
"""
import glob, json, math, os, sys


def pval(diff, lo, hi):
    se = (hi - lo) / (2 * 1.96)
    z = diff / se
    return math.erfc(abs(z) / math.sqrt(2))


def holm(ps, alpha=0.05):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    rej, m = [False] * len(ps), len(ps)
    for k, i in enumerate(order):
        if ps[i] <= alpha / (m - k):
            rej[i] = True
        else:
            break
    return rej


def bh(ps, alpha=0.05):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    m, kmax = len(ps), -1
    for k, i in enumerate(order):
        if ps[i] <= alpha * (k + 1) / m:
            kmax = k
    rej = [False] * m
    for k, i in enumerate(order):
        if k <= kmax:
            rej[i] = True
    return rej


def main(d, year="2024"):
    rows = []
    pat = "paired_*_20??.json" if year == "all" else f"paired_*_{year}.json"
    for f in sorted(glob.glob(os.path.join(d, pat))):
        j = json.load(open(f))
        yr = os.path.basename(f)[-9:-5]
        for t, c in sorted(j["cells"].items()):
            rows.append((j["city"] + (" " + yr if year == "all" else ""), j["target"], t, 100 * c["rel"], pval(c["diff"], c["lo"], c["hi"]), c["significant"]))
    ps = [r[4] for r in rows]
    h, b = holm(ps), bh(ps)
    print("Approximate p from the normal approximation to each cell's bootstrap interval (draws not saved).")
    print(f"{len(rows)} cells, test year {year}; family-wise alpha 0.05 (Holm), FDR 0.05 (Benjamini-Hochberg).")
    w = 13 if year == "all" else 8
    for r, hh, bb in zip(rows, h, b):
        print(f"{r[0]:{w}s}{r[1]} q{r[2]}: {r[3]:+.2f}%  p~{r[4]:.2g}  uncorrected {'*' if r[5] else ' '}  Holm {'*' if hh else ' '}  BH {'*' if bb else ' '}")
    print(f"uncorrected {sum(r[5] for r in rows)}, Holm {sum(h)}, BH {sum(b)} of {len(rows)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "results"),
         sys.argv[2] if len(sys.argv) > 2 else "2024")
