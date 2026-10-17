"""Summarise the committed snapshot of prompts/runs.jsonl. Prints results.txt."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_ledger.ledger import load, summarise

s = summarise(load(os.path.join(HERE, "runs_snapshot.jsonl")))
pct = lambda x: f"{100 * x:.0f}%"
print(f"runs: {s['runs']}   distinct projects listed: {s['distinct_projects']}")
print(f"models: {s['by_model']}")
print(f"tasks: {s['by_task']}")
print("\nmeasurement coverage (share of runs with the field non-null)")
for f, v in sorted(s["coverage"].items(), key=lambda kv: kv[1]):
    print(f"  {f:26s} {pct(v):>5s}")
wm = s["wall_minutes"]
print(f"\nwall minutes derivable from started/ended: {wm['n']} runs, median {wm['median']}")
for name in ["ci_clean_first_time", "runs_with_errors", "runs_with_integrity_issue", "runs_listing_no_project"]:
    r = s[name]
    print(f"{name}: {r['k']}/{r['n']} = {pct(r['rate'])}  (95% Wilson {pct(r['lo'])} to {pct(r['hi'])})")
print("\nper track (slug prefix): distinct projects, runs touching, tests added by single-track runs")
for t, v in s["per_track"].items():
    print(f"  {t:10s} {v['projects']:4d} {v['runs']:4d} {v['tests_added_single_track_runs']:5d}")
print(f"\nslugs listed by more than one run: {s['slugs_in_more_than_one_run']}")
print(f"\nfollow-up families (>=3 slugs sharing a stem): {len(s['families'])}; "
      f"{pct(s['share_of_projects_in_families'])} of projects sit in one")
for k, n in list(s["families"].items())[:12]:
    print(f"  {k:28s} {n}")
