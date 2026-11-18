"""Milestone 7ad: across every cell of 7y, 7aa, 7z, 7ab and 7ac (no new draws), when does dropping the screen pay?
Reads the committed result files. Per cell: audit share n/N, coder J, prevalence, guard-only coverage and the half-width
ratio guard-only / pooled. Writes h7ad_pool_cells.txt.   python3 experiments/h7ad_pool_cells.py

Prediction (written before the script was run): guard-only coverage is 93% or more in every cell, and the width ratio
falls with audit share n/N: every cell with n/N >= 0.25 has ratio <= 1.00, and every cell with ratio > 1.02 has n/N <= 0.08.
Refuted if either threshold fails. The cells are not independent draws of one population (a few corpora, categories, coders).
"""
import re
from pathlib import Path

H = Path(__file__).resolve().parent
cells = []


def num(s):
    return float(s)


for f in sorted(H.glob("h7y_*.txt")):
    t = f.read_text().splitlines()
    m = re.search(r"corpus (\d+), prevalence ([\d.]+), coder J ([\d.]+).*?n (\d+), (\d+) draws", t[0])
    N, prev, J, n, reps = int(m[1]), num(m[2]), num(m[3]), int(m[4]), int(m[5])
    r = {}
    for line in t[2:]:
        p = [x.strip() for x in line.split("|")]
        if len(p) == 4:
            r[p[0]] = (num(p[2]), num(p[3]))
    cells.append((f.stem[4:], n / N, J, prev, r["neg_guard=3 alone"][0], r["neg_guard=3 alone"][1] / r["pooled"][1], reps))

for f in sorted(H.glob("h7ac_*.txt")) + [H / "h7ab_naija_guard_only.txt"]:
    t = f.read_text().splitlines()
    m = re.search(r"corpus (\d+), prevalence ([\d.]+), corpus J ([\d.]+)", t[0])
    if m:
        N, prev, J = int(m[1]), num(m[2]), num(m[3])
    else:
        print("skip header", f.name, t[0]); continue
    pooled = {}
    for line in t[2:]:
        p = [x.strip() for x in line.split("|")]
        if len(p) == 5:
            n = int(p[0])
            if p[1] == "pooled":
                pooled[n] = num(p[4])
            elif p[1].startswith("neg_guard"):
                cells.append((f"{f.stem[4:].lstrip('_')}_n{n}", n / N, J, prev, num(p[3]), num(p[4]) / pooled[n], 1000))

out = ["cell | n/N | coder J | prevalence | guard-only coverage % | width ratio guard-only/pooled"]
for c in sorted(cells, key=lambda c: c[1]):
    out.append(f"{c[0]} | {c[1]:.3f} | {c[2]:.2f} | {c[3]:.4f} | {c[4]:.1f} | {c[5]:.3f}")
mincov = min(c[4] for c in cells)
big = [c for c in cells if c[1] >= 0.25]
bad_big = [c[0] for c in big if c[5] > 1.00]
bad_small = [c[0] for c in cells if c[5] > 1.02 and c[1] > 0.08]
out.append(f"cells {len(cells)}; min coverage {mincov:.1f}; cells with n/N>=0.25: {len(big)}, ratio>1.00 in {bad_big}; ratio>1.02 with n/N>0.08: {bad_small}")
(H / "h7ad_pool_cells.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
