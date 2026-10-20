"""Deviation kinds vs partial outcome and long runs. Reads ../../prompts/runs/*.json."""
import glob, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_devkinds.kinds import kinds_of, kind_vs_none

here = os.path.dirname(__file__)
runs = []
for f in sorted(glob.glob(os.path.join(here, "..", "..", "..", "prompts", "runs", "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and r.get("date") and r.get("outcome"):
        runs.append(r)
dev = [r for r in runs if kinds_of(r)]
print(f"records {len(runs)}, with a deviation {len(dev)}")
counts = {}
for r in dev:
    for k in kinds_of(r):
        counts[k] = counts.get(k, 0) + 1
print("runs per kind (a run can have several):", dict(sorted(counts.items())))
print("--- A: partial outcome, track-stratified, kind minus no-deviation")
for k in sorted(counts):
    d, p, n = kind_vs_none(runs, k, lambda r: r.get("outcome") == "partial")
    print(f"{k:9s} runs in usable strata {n:4d}  diff {d*100:+5.1f} pp  p={p:.3f}")
