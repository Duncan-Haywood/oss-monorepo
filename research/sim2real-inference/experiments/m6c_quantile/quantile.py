"""Milestone 6c: zero-real-run bounds from a quantile or mean discrepancy assumption (LOG.md, 2026-10-24 "Milestone 6c").

Lemma: P(|R - T| > d) <= q and R, T in [0, 1] give E[T - R] <= (1 - q) d + q, so
L = E[T] - (1 - q) d - q is a valid lower bound on E[R] with no real runs.
E|R - T| <= dbar gives L = E[T] - dbar. Inputs are ORACLE values from the 4,000-context pools.
Usage: python3 quantile.py  (writes results/quantile.csv, results/summary_6c.txt)
"""
import csv
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
BOUNDED = os.path.join(HERE, "..", "m3e_bounded_disc", "results", "bounded.csv")
NS = (30, 60, 120, 240)
QS = (0.01, 0.05, 0.10)


def quantile_bound(mean_t, d, q):
    """Lower bound on E[R] from P(|R - T| > d) <= q."""
    return mean_t - (1.0 - q) * d - q


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return rows[0][1:], a


def upper_quantile(x, q):
    """Smallest d with P(x > d) <= q on the pool."""
    return float(np.sort(x)[int(np.ceil((1 - q) * len(x))) - 1])


def main():
    names, a = load()
    t = a[:, 0]
    eb = {(r["pair"], int(r["n"])): float(r["gap_real_eb"]) for r in csv.DictReader(open(BOUNDED))}
    rows = []
    wins = {(k, n): 0 for k in ("mean",) + QS for n in NS}
    for j, name in enumerate(names[1:], start=1):
        r = a[:, j]
        ad = np.abs(r - t)
        row = dict(pair=name, rho=round(float(np.corrcoef(r, t)[0, 1]), 3), mean_abs=round(float(ad.mean()), 4))
        gaps = {"mean": r.mean() - (t.mean() - ad.mean())}
        for q in QS:
            d = upper_quantile(ad, q)
            row[f"d{q}"] = round(d, 3)
            gaps[q] = r.mean() - quantile_bound(t.mean(), d, q)
        for k, g in gaps.items():
            row[f"gap_{k}"] = round(float(g), 4)
            row[f"valid_{k}"] = int(g >= 0)
            for n in NS:
                wins[(k, n)] += g < eb[(name, n)]
        for n in NS:
            row[f"eb{n}"] = round(eb[(name, n)], 4)
        rows.append(row)
    with open(os.path.join(HERE, "results", "quantile.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    lines = ["Zero-real-run bounds with oracle mean / quantile discrepancy on 21 m3 pools"]
    for k in ("mean",) + QS:
        lines.append(f"{k}: valid {sum(r[f'valid_{k}'] for r in rows)}/21; gap median "
                     f"{np.median([r[f'gap_{k}'] for r in rows]):.3f} (min {min(r[f'gap_{k}'] for r in rows):.3f}); "
                     "beats real-only EB on " + ", ".join(f"{wins[(k, n)]}/21 at n={n}" for n in NS))
    lines.append("mean real-only EB gap: " + ", ".join(
        f"n={n}: {np.mean([eb[(nm, n)] for nm in names[1:]]):.3f}" for n in NS))
    lines.append("pair  rho  mean|R-T|  gap_mean  eb240")
    for r in sorted(rows, key=lambda r: r["mean_abs"]):
        lines.append(f"{r['pair']:<11s}{r['rho']:6.2f}{r['mean_abs']:9.3f}{r['gap_mean']:9.3f}{r['eb240']:8.3f}")
    txt = "\n".join(lines)
    open(os.path.join(HERE, "results", "summary_6c.txt"), "w").write(txt + "\n")
    print(txt)


if __name__ == "__main__":
    main()
