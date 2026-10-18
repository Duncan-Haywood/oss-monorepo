"""Print results.txt from the committed snapshot friction_snapshot.jsonl (and runs_snapshot.json).
With --refresh, rebuild both snapshots from ../../prompts/runs/*.json first."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_friction.friction import extract, load, summarise, wilson, theme_of

SNAP, RUNS = os.path.join(HERE, "friction_snapshot.jsonl"), os.path.join(HERE, "runs_snapshot.json")
if "--refresh" in sys.argv:
    rows, runs = extract(os.path.join(HERE, "..", "..", "..", "prompts", "runs"))
    with open(SNAP, "w") as f:
        for r in rows:
            f.write(json.dumps(r, sort_keys=True) + "\n")
    json.dump(runs, open(RUNS, "w"), sort_keys=True)
rows, runs = load(SNAP), json.load(open(RUNS))
s = summarise(rows, runs)
pct = lambda x: f"{100 * x:.0f}%"
lo, hi = wilson(s["runs_with"], s["runs"])
print(f"runs dated {min(r['date'] for r in runs)} to {max(r['date'] for r in runs)}: {s['runs']}; "
      f"runs with >=1 friction entry: {s['runs_with']} ({pct(s['runs_with']/s['runs'])}, 95% Wilson {pct(lo)} to {pct(hi)}); "
      f"entries: {s['entries']}")
print(f"\ndistinct files named: {len(s['files'])}; Gini of entries over files {s['gini_files']:.2f}; "
      f"top 3 files hold {pct(s['top3'])}, top 10 hold {pct(s['top10'])}")
for k, v in s["files"].most_common(10):
    print(f"  {v:4d}  {k}")
print("\nthemes (keyword rules, first match wins)")
for k, v in s["themes"].most_common():
    print(f"  {v:4d}  {pct(v/s['entries']):>4s}  {k}")
print("\nentries per run by track: runs, entries, runs with an entry")
for t, (n, e, w) in sorted(s["per_track"].items(), key=lambda kv: -kv[1][0]):
    print(f"  {str(t):9s} {n:4d} {e:4d} {w:4d}   {e/n:.2f} per run")
print("\nrepeat rate by day: entries whose (file, theme) was reported on an EARLIER day")
for d, (k, n) in s["repeat"].items():
    print(f"  {d}  {k:3d}/{n:3d}  {pct(k/n)}")
print(f"\n(file, theme) pairs reported on >=3 different days: {len(s['persistent'])}")
for days, (f, t) in s["persistent"][:12]:
    print(f"  {days} days  {f}  [{t}]")
