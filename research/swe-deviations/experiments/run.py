"""Deviation vs no deviation in prompts/runs/*.json. Prints results.txt. Run from anywhere."""
import glob, json, math, os, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_deviations.dev import deviated, strata, usable, perm_test, partial_table, partial_perm, stat

root = os.path.join(HERE, "..", "..", "..", "prompts", "runs")
runs = []
for f in sorted(glob.glob(os.path.join(root, "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and r.get("date") and r.get("outcome"):
        runs.append(r)
nd = sum(map(deviated, runs))
print(f"records {len(runs)}   dates {min(r['date'] for r in runs)} to {max(r['date'] for r in runs)}   with deviations {nd} ({100 * nd / len(runs):.1f}%)")

print("\n== A. share of records that list a deviation, by track")
tr = {}
for r in runs:
    t = tr.setdefault(r["track"], [0, 0]); t[1] += 1; t[0] += deviated(r)
for t, (k, n) in sorted(tr.items(), key=lambda kv: -kv[1][1]):
    print(f"  {t:10s}{k:5d}/{n:<5d} {100 * k / n:5.1f}%")

print("\n== B. medians within strata (track x early/late recording regime); with deviation vs without")
for field in ("cost_usd", "wall_minutes", "tool_calls"):
    g = strata(runs, field)
    u = usable(g)
    print(f"\n  {field}: strata with >=3 records in each arm: {len(u)} of {len(g)}")
    print("    stratum              n_dev  n_no   median_dev  median_no")
    for k, (a, b) in sorted(u.items()):
        print(f"    {k[0]:9s}{k[1]:6s}     {len(a):5d} {len(b):5d}   {statistics.median(a):10.2f} {statistics.median(b):10.2f}")
    if u:
        obs, p = perm_test(u)
        print(f"    pooled log cost ratio (dev/no) {obs:+.3f}  = x{math.exp(obs):.2f}   permutation p = {p:.4f}  (5000 shuffles of the label inside strata)")

print("\n== C. partial outcomes")
t = partial_table(runs)
print("    stratum              partial/n with dev   partial/n without")
for k, (pa, na, pb, nb) in sorted(t.items()):
    if na and nb:
        print(f"    {k[0]:9s}{k[1]:6s}     {pa:3d}/{na:<4d}            {pb:3d}/{nb:<4d}")
obs, p = partial_perm(runs)
print(f"    pooled difference in partial share (dev - no) {100 * obs:+.1f} points   permutation p = {p:.4f}")

print("\n== D. leave one track out: pooled cost ratio (dev/no) and permutation p, cost_usd and wall_minutes")
for field in ("cost_usd", "wall_minutes"):
    g = usable(strata(runs, field))
    print(f"  {field}")
    for drop in sorted({k[0] for k in g}):
        sub = {k: v for k, v in g.items() if k[0] != drop}
        obs, p = perm_test(sub)
        print(f"    without {drop:9s} x{math.exp(obs):.2f}   p = {p:.4f}")
