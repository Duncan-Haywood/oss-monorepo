"""Milestone 61: correlate BOHB's gain over random routing with R2 faithfulness (Kendall tau of R2 vs routed R4) per cell.
Reads cells.json and cells_unseen.json (written by bohb.py). No flow. Usage: python3 faith_corr.py. Writes faith_corr.txt."""
import json, random
from pathlib import Path
H = Path(__file__).resolve().parent
cells = {}
for f in ("cells.json", "cells_unseen.json"):
    cells.update(json.loads((H / f).read_text()))


def rank(v):
    o = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0] * len(v); i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
            j += 1
        for k in range(i, j + 1):
            r[o[k]] = (i + j) / 2
        i = j + 1
    return r


def spear(x, y):
    a, b = rank(x), rank(y); n = len(a); ma, mb = sum(a) / n, sum(b) / n
    sa = sum((t - ma) ** 2 for t in a) ** .5; sb = sum((t - mb) ** 2 for t in b) ** .5
    return sum((p - ma) * (q - mb) for p, q in zip(a, b)) / (sa * sb) if sa and sb else float("nan")


def boot(x, y):
    rng = random.Random(0); n = len(x); v = []
    for _ in range(2000):
        ix = [rng.randrange(n) for _ in range(n)]
        r = spear([x[i] for i in ix], [y[i] for i in ix])
        if r == r:
            v.append(r)
    v.sort(); return v[int(.025 * len(v))], v[int(.975 * len(v))]


L = ["# milestone 61: Spearman rho between tau(R2,R4) and gain = random - BOHB regret (points), over cells; 95% bootstrap over cells"]
for label, pick in (("all", lambda k: True), ("tight", lambda k: k.startswith("tight")), ("relaxed", lambda k: k.startswith("relaxed"))):
    ks = [k for k in cells if pick(k) and cells[k]["tau_r2"] is not None]
    for B in (15, 25, 40):
        for arm in ("bohb", "bohb_r4first"):
            ok = [k for k in ks if cells[k].get(f"{arm}_B{B}") is not None and cells[k].get(f"rand_B{B}") is not None]
            x = [cells[k]["tau_r2"] for k in ok]; y = [cells[k][f"rand_B{B}"] - cells[k][f"{arm}_B{B}"] for k in ok]
            lo, hi = boot(x, y)
            L.append(f"{label} | B {B} | {arm} | n {len(ok)} | rho {spear(x, y):+.2f} [{lo:+.2f}, {hi:+.2f}]")
ok = sorted((k for k in cells if cells[k]["tau_r2"] is not None and cells[k].get("bohb_B15") is not None), key=lambda k: -cells[k]["bohb_B15"])
L.append("\n## five worst BOHB cells at 15 (regret %, tau R2) and five lowest-tau cells (tau, BOHB regret at 15)")
L += [f"{k}: {cells[k]['bohb_B15']:.1f} %, tau {cells[k]['tau_r2']:.2f}" for k in ok[:5]]
L.append("--")
L += [f"{k}: tau {cells[k]['tau_r2']:.2f}, bohb {cells[k]['bohb_B15']:.1f} %, rand {cells[k]['rand_B15']:.1f} %" for k in sorted(ok, key=lambda k: cells[k]["tau_r2"])[:5]]
(H / "faith_corr.txt").write_text("\n".join(L) + "\n"); print("\n".join(L))
