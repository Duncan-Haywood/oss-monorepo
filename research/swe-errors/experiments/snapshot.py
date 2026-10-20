"""Rebuild errors_snapshot.jsonl from prompts/runs/*.json. Run from the repo root:
python3 research/swe-errors/experiments/snapshot.py"""
import glob
import json
import os

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, "..", "..", "..")
rows = []
for f in sorted(glob.glob(os.path.join(root, "prompts", "runs", "*.json"))):
    r = json.load(open(f))
    rows.append({"date": os.path.basename(f)[:10], "track": r.get("track"), "model": r.get("model"),
                 "outcome": r.get("outcome"), "cost_usd": r.get("cost_usd"), "errors": [e if isinstance(e, str) else str(e.get("what", "")) for e in (r.get("errors") or [])]})
with open(os.path.join(here, "errors_snapshot.jsonl"), "w") as out:
    for row in rows:
        out.write(json.dumps(row) + "\n")
print(len(rows), "runs")
