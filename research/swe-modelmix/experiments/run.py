"""Prints the results. Run from this directory: python3 experiments/run.py > experiments/results.txt"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_modelmix import (boot_ratio_of_medians, by_model_track, load, project_cv,
                          runs_needed)

runs = load(os.path.join(os.path.dirname(__file__), "costs_snapshot.jsonl"))
priced = [r for r in runs if r.get("cost_usd") is not None and r.get("model")]
print(f"priced runs with a model: {len(priced)} of {len(runs)}")
for m in sorted({r["model"] for r in priced}):
    print(f"  {m}: {sum(r['model'] == m for r in priced)} runs")
print()
print("cost ratio, Opus median / Sonnet median, within track (95% bootstrap)")
for t, d in sorted(by_model_track(runs).items()):
    o, s = d.get("claude-opus-5-5"), d.get("claude-sonnet-5-5")
    if o and s and len(o) >= 3:  # a bootstrap of fewer than 3 Opus runs says nothing
        p, lo, hi = boot_ratio_of_medians(o, s)
        print(f"  {t:9} opus n={len(o):2} sonnet n={len(s):3}  ratio {p:5.1f} ({lo:.1f} to {hi:.1f})")
print()
res = [r for r in priced if r["track"] == "research" and r["model"] == "claude-sonnet-5-5"]
cv, n = project_cv(res)
print(f"projects landed per Sonnet research run: CV {cv:.2f} over {n} runs")
for rel in (0.25, 0.5, 1.0):
    k = runs_needed(cv, rel)
    print(f"  runs per arm to detect a {int(rel*100)}% difference in projects per run: {k}")
print("  (an Opus arm of the same size would cost the ratio above times the Sonnet arm)")
