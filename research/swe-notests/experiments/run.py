"""No-test runs vs runs that add tests in prompts/runs/*.json. Prints results.txt. Run from anywhere."""
import glob, json, math, os, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_notests.nt import has_count, no_tests, partial_table, partial_perm, cost_strata, usable, cost_perm

root = os.path.join(HERE, "..", "..", "..", "prompts", "runs")
runs = []
for f in sorted(glob.glob(os.path.join(root, "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and r.get("date") and r.get("outcome"):
        runs.append(r)
cnt = [r for r in runs if has_count(r)]
nz = [r for r in cnt if no_tests(r)]
print(f"records {len(runs)}   with a tests_added count {len(cnt)}   adding no tests {len(nz)} ({100 * len(nz) / len(cnt):.1f}%)")
print(f"dates {min(r['date'] for r in cnt)} to {max(r['date'] for r in cnt)}")

print("\n== A. share of counted runs that add no tests, by track")
tr = {}
for r in cnt:
    t = tr.setdefault(r["track"], [0, 0]); t[1] += 1; t[0] += no_tests(r)
for t, (k, n) in sorted(tr.items(), key=lambda kv: -kv[1][1]):
    print(f"  {t:10s}{k:5d}/{n:<5d} {100 * k / n:5.1f}%")

print("\n== B. partial outcomes, no tests vs tests, within track x early/late")
t = partial_table(runs)
print("    stratum              partial/n no tests   partial/n with tests")
for k, (pa, na, pb, nb) in sorted(t.items()):
    if na and nb:
        print(f"    {k[0]:9s}{k[1]:6s}     {pa:3d}/{na:<4d}            {pb:3d}/{nb:<4d}")
obs, p = partial_perm(runs)
tp = sum(r[0] for r in t.values()); tn = sum(r[1] for r in t.values())
print(f"    all counted: partial {tp}/{tn} without tests; with tests {sum(r[2] for r in t.values())}/{sum(r[3] for r in t.values())}")
print(f"    pooled difference in partial share (no tests - tests) {100 * obs:+.1f} points   permutation p = {p:.4f}  (5000 shuffles inside strata)")

print("\n== C. cost_usd medians within strata")
g = cost_strata(runs)
u = usable(g)
print(f"  strata with >=3 priced runs in each arm: {len(u)} of {len(g)}")
print("    stratum              n_none n_tests  median_none median_tests")
for k, (a, b) in sorted(u.items()):
    print(f"    {k[0]:9s}{k[1]:6s}     {len(a):5d} {len(b):6d}   {statistics.median(a):10.2f} {statistics.median(b):10.2f}")
if u:
    o, p = cost_perm(u)
    print(f"    pooled log cost ratio (none/tests) {o:+.3f} = x{math.exp(o):.2f}   permutation p = {p:.4f}")

print("\n== D. what the no-test runs shipped: projects listed (0 means no project)")
for lab, grp in (("no tests", nz), ("tests", [r for r in cnt if not no_tests(r)])):
    z = sum(1 for r in grp if not r.get("projects"))
    print(f"  {lab:9s} {z}/{len(grp)} list no project ({100 * z / len(grp):.1f}%)")
print("\n== E. partial rate among no-test runs that list a project vs none")
for lab, grp in (("project", [r for r in nz if r.get("projects")]), ("no project", [r for r in nz if not r.get("projects")])):
    print(f"  {lab:10s} {sum(r['outcome'] == 'partial' for r in grp)}/{len(grp)} partial")
