import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_prflow import prflow as p

rows = p.parse(os.path.join(HERE, "prs.txt"))
out = []
w = out.append
n = len(rows)
m = sum(r["merged"] is not None for r in rows)
lo, hi = p.wilson(m, n)
w(f"closed PRs: {n}; merged: {m} ({m/n:.1%}, Wilson 95% {lo:.1%} to {hi:.1%}); closed unmerged: {n-m}")
w("")
w("merge rate by era (created date)")
for k, (a, b) in sorted(p.merge_rate_by(rows, p.era).items()):
    l, h = p.wilson(a, b)
    w(f"  {k:22s} merged {a:3d}/{b:3d} = {a/b:.1%} (Wilson {l:.1%} to {h:.1%})")
w("")
w("merge rate by creation day")
for k, (a, b) in sorted(p.merge_rate_by(rows, lambda r: r["created"].strftime("%m-%d")).items()):
    w(f"  {k}  {a:3d}/{b:3d} = {a/b:.0%}")
w("")
lat = p.latencies_min(rows)
w("time from creation to merge, minutes (merged PRs only)")
for k, ls in [("all", lat)] + [(e, p.latencies_min([r for r in rows if p.era(r) == e])) for e in ("bulk (09-28..10-01)", "tracked (10-05..)")]:
    w(f"  {k:22s} n={len(ls):3d} median {p.quantile(ls,.5):6.1f}  p90 {p.quantile(ls,.9):7.1f}  max {max(ls):8.1f}")
slow = [r for r in rows if r["merged"] and (r["merged"] - r["created"]).total_seconds() > 3600 * 3]
w(f"  merged after more than 3 h: {len(slow)} PRs")
w("")
b = p.batch_merges(rows)
w("batch merges: 3 or more PRs sharing one merge timestamp to the second")
for t, g in b:
    waits = [(r["merged"] - r["created"]).total_seconds() / 3600 for r in g]
    w(f"  {t:%m-%dT%H:%M:%S}  {len(g):2d} PRs, waited {min(waits):.1f} to {max(waits):.1f} h")
tot = sum(len(g) for _, g in b)
w(f"  {tot} of {m} merged PRs ({tot/m:.1%}) were merged in {len(b)} such batches")
w("")
ids = p.burst_membership(rows, 10)
bm = [r for r in rows if r["n"] in ids]
nb = [r for r in rows if r["n"] not in ids]
w("bursts: PRs created within 10 s of the previous PR")
for name, g in (("in a burst", bm), ("not in a burst", nb)):
    a = sum(r["merged"] is not None for r in g)
    l, h = p.wilson(a, len(g))
    w(f"  {name:15s} merged {a:3d}/{len(g):3d} = {a/len(g):.1%} (Wilson {l:.1%} to {h:.1%})")
runs = p.bursts(rows, 10)
w(f"  {len(runs)} bursts, sizes: {sorted((len(x) for x in runs), reverse=True)}")
w("")
un = [r for r in rows if r["merged"] is None]
w("closed-unmerged PRs by number: " + ", ".join(str(r["n"]) for r in un))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
