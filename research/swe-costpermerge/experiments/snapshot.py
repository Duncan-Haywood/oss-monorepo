"""Write costs_merge_snapshot.jsonl from prompts/runs/ and main's first-parent history.

Needs a full (unshallow) clone: git fetch --unshallow origin main. Run from anywhere:
    python3 experiments/snapshot.py
"""
import glob, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_costpermerge.join import merged_numbers, pr_number, status

ROOT = os.path.join(HERE, "..", "..", "..")
subjects = subprocess.run(["git", "-C", ROOT, "log", "origin/main", "--first-parent", "--format=%s"],
                          capture_output=True, text=True, check=True).stdout.splitlines()
if len(subjects) < 5000:
    sys.exit("history looks shallow: git fetch --unshallow origin main")
merged = merged_numbers(subjects)
rows = []
for f in sorted(glob.glob(os.path.join(ROOT, "prompts", "runs", "*.json"))):
    try:
        d = json.load(open(f))
    except ValueError:
        continue
    if d.get("cost_usd") is None:
        continue
    rows.append({"date": d.get("date"), "track": d.get("track"), "model": d.get("model"),
                 "cost_usd": d["cost_usd"], "tool_calls": d.get("tool_calls"),
                 "pr": pr_number(d.get("pr")), "status": status(d, merged),
                 "outcome": d.get("outcome"), "projects": len(d.get("projects") or [])})
rows.sort(key=lambda r: (r["date"] or "", r["cost_usd"]))
with open(os.path.join(HERE, "costs_merge_snapshot.jsonl"), "w") as out:
    for r in rows:
        out.write(json.dumps(r, sort_keys=True) + "\n")
print(f"{len(rows)} priced runs; {len(merged)} merged PR numbers on main")
