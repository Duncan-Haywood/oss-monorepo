"""Milestone 1a: how fast does each heavy-machine class lose value? Real auction prices.

    python3 experiments/depreciation.py <path to TrainAndValid.csv> > experiments/depreciation_results.txt

Data: Kaggle "Blue Book for Bulldozers" (Fast Iron), 412,698 US auction sales 1989-2012 with
sale price, year made, model and product class. Kaggle's competition terms allow academic
research use; the raw file is not redistributed here (see README, "Data").
"""
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from heavy_market.fe import depreciation, sweep  # noqa: E402
from heavy_market.figure import write_svg  # noqa: E402

GROUPS = {"TEX": "track excavator", "SSL": "skid steer loader", "BL": "backhoe loader",
          "WL": "wheel loader", "TTT": "track-type tractor (dozer)", "MG": "motor grader"}
MIN_AGE, MAX_AGE = 0, 30


def load(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            made = int(r["YearMade"])
            sale_year = int(r["saledate"].split("/")[2][:4])
            age = sale_year - made
            if made < 1950 or not MIN_AGE <= age <= MAX_AGE:
                continue
            rows.append((r["ProductGroup"], float(r["SalePrice"]), age, int(r["ModelID"]), sale_year,
                         r["fiProductClassDesc"], made))
    return rows


def arrays(rows):
    return (np.log([r[1] for r in rows]), np.array([r[2] for r in rows]),
            np.array([r[3] for r in rows]), np.array([r[4] for r in rows]))


def naive(lp, age):
    a = np.vstack([np.ones_like(age, dtype=float), age]).T
    return 1 - np.exp(np.linalg.lstsq(a, lp, rcond=None)[0][1])


def fmt(d):
    return (f"{100 * d['rate']:5.1f}%  [{100 * d['rate_lo']:4.1f}, {100 * d['rate_hi']:4.1f}]"
            f"  n={d['n']:>7,}  models={d['models']:>5,}")


def main(path):
    rows = load(path)
    print(f"rows kept (1950 <= year made, age 0-{MAX_AGE}): {len(rows):,}")
    by = defaultdict(list)
    for r in rows:
        by[r[0]].append(r)

    print("\n== 1. Annual depreciation by class: model + sale-year fixed effects, 95% CI clustered by model")
    print("class                          FE rate  [95% CI]           n         models   pooled OLS (no FE)")
    results = {}
    for g, name in GROUPS.items():
        lp, age, model, sale = arrays(by[g])
        d = depreciation(lp, age, model, sale)
        results[g] = d
        print(f"{name:<30} {fmt(d)}   {100 * naive(lp, age):5.1f}%")

    print("\n== 2. Robustness: same estimator on subsets")
    print("class                          ages 0-10                     ages 11-30                    sales 2008-2012")
    for g, name in GROUPS.items():
        cells = []
        for keep in (lambda r: r[2] <= 10, lambda r: r[2] > 10, lambda r: r[4] >= 2008):
            sub = [r for r in by[g] if keep(r)]
            d = depreciation(*arrays(sub))
            cells.append(f"{100 * d['rate']:5.1f}% [{100 * d['rate_lo']:4.1f},{100 * d['rate_hi']:4.1f}]")
        print(f"{name:<30} " + "   ".join(f"{c:<26}" for c in cells))

    print("\n== 3. Track excavators by operating weight: depreciation and price per tonne")
    print("Price per tonne: median sale price of machines 0-3 years old sold 2009-2012, divided by the")
    print("class midpoint (nominal dollars of the sale year; a used-market floor under new list price).")
    bins = defaultdict(list)
    for r in by["TEX"]:
        m = re.search(r"- ([\d.]+) to ([\d.]+) Metric Tons", r[5])
        if m:
            bins[(float(m.group(1)), float(m.group(2)))].append(r)
        elif "Plus" in r[5] or "+" in r[5]:
            pass
    print("weight class (t)   FE rate [95% CI]            n        young n   median $   $/tonne")
    table = []
    for (lo, hi) in sorted(bins):
        sub = bins[(lo, hi)]
        d = depreciation(*arrays(sub))
        young = [r[1] for r in sub if r[2] <= 3 and r[4] >= 2009]
        med = float(np.median(young)) if len(young) >= 20 else float("nan")
        per_t = med / ((lo + hi) / 2)
        table.append((lo, hi, d, len(young), med, per_t))
        print(f"{lo:5.1f} to {hi:5.1f}     {100 * d['rate']:5.1f}% [{100 * d['rate_lo']:4.1f},{100 * d['rate_hi']:4.1f}]"
              f"   {d['n']:>7,}  {len(young):>6}   {med:>9,.0f}   {per_t:>7,.0f}")
    ok = [(np.log((lo + hi) / 2), np.log(pt)) for lo, hi, d, n, med, pt in table if n >= 20]
    if len(ok) >= 3:
        xs, ys = np.array(ok).T
        slope = np.polyfit(xs, ys, 1)[0]
        print(f"log-log slope of $/tonne on tonnes across {len(ok)} class medians: {slope:+.2f} "
              f"(negative = small machines cost more per tonne)")
    # row level: log price on log class midpoint, sale-year effects swept out, SE clustered by model
    young = [(r, (lo + hi) / 2) for lo, hi, d, n, med, pt in table if n >= 20
             for r in bins[(lo, hi)] if r[2] <= 3 and r[4] >= 2009]
    y = np.log([r[1] for r, _ in young]); x = np.log([t for _, t in young])
    s_y = np.array([r[4] for r, _ in young]); mod = np.array([r[3] for r, _ in young])
    yt, xt = sweep(y, [s_y]), sweep(x, [s_y])
    b = float(xt @ yt) / float(xt @ xt)
    _, inv = np.unique(mod, return_inverse=True)
    sc = np.bincount(inv, weights=xt * (yt - b * xt)); g = len(sc)
    se = float(np.sqrt(np.sum(sc ** 2) * g / (g - 1)) / float(xt @ xt))
    print(f"row level ({len(young):,} sales, {g} models): price elasticity to operating weight "
          f"{b:.3f} [{b - 1.96 * se:.3f}, {b + 1.96 * se:.3f}], so $/tonne elasticity {b - 1:+.3f}")

    print("\n== 4. Skid steers by rated operating capacity")
    sbins = defaultdict(list)
    for r in by["SSL"]:
        m = re.search(r"- ([\d.]+) to ([\d.]+) Lb", r[5])
        if m:
            sbins[(float(m.group(1)), float(m.group(2)))].append(r)
    print("capacity (lb)        FE rate [95% CI]            n        young n   median $")
    for (lo, hi) in sorted(sbins):
        sub = sbins[(lo, hi)]
        d = depreciation(*arrays(sub))
        young = [r[1] for r in sub if r[2] <= 3 and r[4] >= 2009]
        med = float(np.median(young)) if len(young) >= 20 else float("nan")
        print(f"{lo:6.0f} to {hi:6.0f}     {100 * d['rate']:5.1f}% [{100 * d['rate_lo']:4.1f},{100 * d['rate_hi']:4.1f}]"
              f"   {d['n']:>7,}  {len(young):>6}   {med:>9,.0f}")
    out = Path(__file__).with_name("price_per_tonne.svg")
    write_svg(out, [((lo + hi) / 2, pt, n) for lo, hi, d, n, med, pt in table if n >= 20],
              [(GROUPS[g], results[g]) for g in GROUPS])
    print(f"\nfigure: experiments/{out.name}")
    return results, table


if __name__ == "__main__":
    main(sys.argv[1])
