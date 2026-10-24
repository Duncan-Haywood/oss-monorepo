"""Milestone 6b: discrepancy-scaled floor and the zero-real-run ceiling (LOG.md, 2026-10-24 "Milestone 6b").

Corollary: over laws with |R - T| <= D, any valid (1 - delta) lower bound from m pairs has a law
with a perfect twin where P(L <= 1 - D eps*) >= 1/2, eps* = 1 - (2 delta)^(1/m).
Ceiling: with D and the twin law known, L0 = E[T] - D is valid with no real runs (gap D).
Check on the m3 pools with the ORACLE D = max |R - T| (no procedure can know it).
Usage: python3 dfloor.py  (writes results/dfloor.csv, results/summary_6b.txt)
"""
import csv
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
BOUNDED = os.path.join(HERE, "..", "m3e_bounded_disc", "results", "bounded.csv")
NS = (30, 60, 120, 240)


def d_floor(m, delta, d):
    """Gap that any valid bound over the class |R - T| <= d exceeds with probability <= 1/2."""
    return d * (1.0 - (2.0 * delta) ** (1.0 / m))


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return rows[0][1:], a


def main():
    names, a = load()
    t = a[:, 0]
    eb = {}
    for r in csv.DictReader(open(BOUNDED)):
        eb[(r["pair"], int(r["n"]))] = float(r["gap_real_eb"])
    out_rows, wins = [], {n: 0 for n in NS}
    for j, name in enumerate(names[1:], start=1):
        r = a[:, j]
        d = float(np.abs(r - t).max())
        l0 = t.mean() - d
        gap0 = r.mean() - l0
        row = dict(pair=name, D=round(d, 3), gap0=round(gap0, 4), valid=int(gap0 >= 0),
                   rho=round(float(np.corrcoef(r, t)[0, 1]), 3))
        for n in NS:
            row[f"eb{n}"] = round(eb[(name, n)], 4)
            row[f"floor{n}"] = round(d_floor(n, 0.05, d), 4)
            wins[n] += gap0 < eb[(name, n)]
        out_rows.append(row)
    with open(os.path.join(HERE, "results", "dfloor.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0]))
        w.writeheader()
        w.writerows(out_rows)
    ebm = {n: np.mean([eb[(nm, n)] for nm in names[1:]]) for n in NS}
    lines = ["Oracle-D zero-real-run bound L0 = mean(T) - max|R - T| on 21 m3 pools",
             f"valid on {sum(r['valid'] for r in out_rows)}/21 pairs; D range {min(r['D'] for r in out_rows)}"
             f" to {max(r['D'] for r in out_rows)}, median {np.median([r['D'] for r in out_rows]):.3f};"
             f" gap0 median {np.median([r['gap0'] for r in out_rows]):.3f}"]
    for n in NS:
        lines.append(f"n={n}: L0 beats real-only EB on {wins[n]}/21 pairs (mean EB gap {ebm[n]:.3f}; "
                     f"D-floor at median D {d_floor(n, 0.05, float(np.median([r['D'] for r in out_rows]))):.4f})")
    lines.append("pair  D  rho  gap0  (D below mean EB gap at n=240 -> L0 can win)")
    for r in sorted(out_rows, key=lambda r: r["D"]):
        lines.append(f"{r['pair']:<11s}{r['D']:6.3f}{r['rho']:7.2f}{r['gap0']:8.3f}  eb240={r['eb240']:.3f}")
    txt = "\n".join(lines)
    open(os.path.join(HERE, "results", "summary_6b.txt"), "w").write(txt + "\n")
    print(txt)


if __name__ == "__main__":
    main()
