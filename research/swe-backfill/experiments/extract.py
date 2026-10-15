"""Extract research/ commit history from a full git clone into commits.jsonl.

Run it from a clone with full history of a repository that keeps projects at
research/<slug>/ (oss-monorepo does; its history includes the original
oss-research-monorepo commits). Usage:  python3 extract.py <repo> <ref> <out.jsonl>
One JSON line per non-merge commit that touches research/<slug>/: abbreviated
hash, author time in UTC, subject, and for each slug the files added (A),
modified (M) or deleted (D). Committed output: commits.jsonl (no emails/names).
"""
import json, re, subprocess, sys
from datetime import datetime, timezone

repo, ref, out = sys.argv[1:4]
raw = subprocess.run(
    ["git", "-C", repo, "log", ref, "--no-merges", "--format=@@%h|%aI|%s", "--name-status", "--", "research"],
    check=True, capture_output=True, text=True).stdout
commits, cur = [], None
for line in raw.splitlines():
    if line.startswith("@@"):
        h, t, s = line[2:].split("|", 2)
        t = datetime.fromisoformat(t).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        cur = {"hash": h, "time": t, "subject": s, "slugs": {}}
        commits.append(cur)
    elif line.strip() and cur is not None:
        parts = line.split("\t")
        status, paths = parts[0][0], parts[1:]
        for p in paths:
            m = re.match(r"research/([^/]+)/(.*)", p)
            if m and not m.group(1).startswith(("_", ".")):
                d = cur["slugs"].setdefault(m.group(1), {"A": 0, "M": 0, "D": 0, "tests_A": 0})
                k = "D" if status == "D" else ("A" if status in "AR" and p == paths[-1] else "M")
                d[k] += 1
                if k == "A" and re.search(r"(^|/)test[^/]*\.py$", m.group(2)):
                    d["tests_A"] += 1
commits = [c for c in commits if c["slugs"]]
with open(out, "w") as f:
    for c in sorted(commits, key=lambda c: c["time"]):
        f.write(json.dumps(c, sort_keys=True) + "\n")
print(len(commits), "commits")
