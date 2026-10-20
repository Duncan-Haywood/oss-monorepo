"""Prints the results. Run from this directory: python3 experiments/run.py > experiments/results.txt"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_errors import (boot_median_diff, category_counts, error_share, load, partial_rate,
                        wilson, classify)

runs = load(os.path.join(os.path.dirname(__file__), "errors_snapshot.jsonl"))
k, n = error_share(runs)
lo, hi = wilson(k, n)
print(f"runs: {n}; with at least one recorded error: {k} ({k/n:.1%}, 95% Wilson {lo:.1%} to {hi:.1%})")
cc = category_counts(runs)
tot = sum(cc.values())
print(f"error entries: {tot}")
print("\ncategory share of entries (keyword rules)")
for c, v in sorted(cc.items(), key=lambda x: -x[1]):
    print(f"  {c:13} {v:4}  {v/tot:5.1%}")
print("\nruns with an error, by track")
for t in sorted({r["track"] for r in runs}):
    sub = [r for r in runs if r["track"] == t]
    a, m = error_share(sub)
    l, h = wilson(a, m)
    print(f"  {t:9} {a:3}/{m:3}  {a/m:5.1%}  ({l:.1%} to {h:.1%})")
print("\npartial outcome rate, with vs without a recorded error")
for name, sub in (("with error", [r for r in runs if r["errors"]]), ("no error", [r for r in runs if not r["errors"]])):
    a, m = partial_rate(sub)
    l, h = wilson(a, m)
    print(f"  {name:10} {a:3}/{m:3}  {a/m:5.1%}  ({l:.1%} to {h:.1%})")
print("\nmedian cost USD, runs with vs without an error (priced runs)")
w = [r["cost_usd"] for r in runs if r["errors"] and r["cost_usd"]]
wo = [r["cost_usd"] for r in runs if not r["errors"] and r["cost_usd"]]
d, l, h = boot_median_diff(w, wo)
print(f"  with error n={len(w)} median {sorted(w)[len(w)//2]:.2f}; no error n={len(wo)} median {sorted(wo)[len(wo)//2]:.2f}; diff {d:+.2f} ({l:+.2f} to {h:+.2f})")
print("\nentries per category by month half (early = before 2026-10-15)")
for c in sorted(cc):
    e = sum(1 for r in runs if r["date"] < "2026-10-15" for x in r["errors"] if classify(x) == c)
    lt = sum(1 for r in runs if r["date"] >= "2026-10-15" for x in r["errors"] if classify(x) == c)
    print(f"  {c:13} early {e:3}  late {lt:3}")
