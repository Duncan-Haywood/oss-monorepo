"""Write experiments/runs_snapshot.jsonl: track, date, cost_usd, tool_calls, tests_added, projects count
for each record in prompts/runs/ with a non-null cost_usd.

    python experiments/snapshot.py        # from anywhere; reads ../../../prompts/runs
"""
import glob, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
out = []
for f in sorted(glob.glob(os.path.join(HERE, "..", "..", "..", "prompts", "runs", "*.json"))):
    try:
        d = json.load(open(f))
    except ValueError:
        continue
    if not isinstance(d, dict) or d.get("cost_usd") is None:
        continue
    p = d.get("projects")
    out.append({"track": d.get("track"), "date": d.get("date"), "cost_usd": d["cost_usd"],
                "tool_calls": d.get("tool_calls"), "tests_added": d.get("tests_added"),
                "projects": len(p) if isinstance(p, list) else None})
out.sort(key=lambda r: (str(r["date"]), r["cost_usd"]))
with open(os.path.join(HERE, "runs_snapshot.jsonl"), "w") as fh:
    for r in out:
        fh.write(json.dumps(r) + "\n")
print(len(out), "priced records")
