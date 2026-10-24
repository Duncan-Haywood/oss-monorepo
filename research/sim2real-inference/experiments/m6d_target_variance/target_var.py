"""Milestone 6d: variance of |R - T| against R as estimation targets (LOG.md, 2026-10-24 "Milestone 6d").

Usage: python3 target_var.py  (writes results/target_var.csv, results/summary_6d.txt)
"""
import csv
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6c_quantile"))
from quantile import load  # noqa: E402

DELTA = 0.05
NS = (60, 240)


def eb_halfwidth(var, rng_, n, delta=DELTA):
    """Maurer-Pontil empirical-Bernstein half-width for a sample of size n with range rng_."""
    return np.sqrt(2 * var * np.log(2 / delta) / n) + 7 * rng_ * np.log(2 / delta) / (3 * (n - 1))


def main():
    names, a = load()
    t = a[:, 0]
    rows = []
    for j, name in enumerate(names[1:], start=1):
        r = a[:, j]
        d, ad = r - t, np.abs(r - t)
        row = dict(pair=name, rho=round(float(np.corrcoef(r, t)[0, 1]), 3),
                   var_r=float(r.var()), var_d=float(d.var()), var_abs=float(ad.var()),
                   ratio=float(ad.var() / r.var()), one_sided=int(bool(np.all(d <= 1e-12) or np.all(d >= -1e-12))),
                   identity_gap=float(abs(ad.var() - d.var())) if (np.all(d <= 1e-12) or np.all(d >= -1e-12)) else float("nan"))
        for n in NS:
            row[f"eb_r{n}"] = float(eb_halfwidth(r.var(), np.ptp(r), n))
            row[f"eb_abs{n}"] = float(eb_halfwidth(ad.var(), np.ptp(ad), n))
        rows.append(row)
    with open(os.path.join(HERE, "results", "target_var.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    hi = [x for x in rows if x["rho"] >= 0.8]
    lo_win = sum(x["ratio"] < 1 for x in rows)
    hi_win = sum(x["ratio"] < 1 for x in hi)
    lines = ["Var(|R-T|) vs Var(R) on 21 m3 pools",
             f"Var(|R-T|) < Var(R): {lo_win}/21 overall; {hi_win}/{len(hi)} with rho >= 0.8",
             f"median ratio {np.median([x['ratio'] for x in rows]):.3f}; one-sided pairs {sum(x['one_sided'] for x in rows)}/21; "
             f"max identity gap on one-sided pairs {np.nanmax([x['identity_gap'] for x in rows]):.2e}"]
    for n in NS:
        lines.append(f"EB half-width smaller for |R-T| than R at n={n}: "
                     f"{sum(x[f'eb_abs{n}'] < x[f'eb_r{n}'] for x in rows)}/21")
    lines.append("pair  rho  var_r  var_abs  ratio")
    for x in sorted(rows, key=lambda x: x["rho"]):
        lines.append(f"{x['pair']:<11s}{x['rho']:6.2f}{x['var_r']:9.4f}{x['var_abs']:9.4f}{x['ratio']:8.3f}")
    txt = "\n".join(lines)
    open(os.path.join(HERE, "results", "summary_6d.txt"), "w").write(txt + "\n")
    print(txt)


if __name__ == "__main__":
    main()
