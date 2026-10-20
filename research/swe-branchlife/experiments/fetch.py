"""Fetch, for each pull request in swe-prlifetime/data/prs.csv, the times of its commits.

    GITHUB_TOKEN=... python3 experiments/fetch.py     # optional token; unauthenticated is 60 calls/hour

Writes data/branches.csv: number, first_author, first_commit, n_commits, truncated.
Only timestamps and counts are kept (no names, e-mails or messages).
"""
import csv
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRS = ROOT.parent / "swe-prlifetime" / "data" / "prs.csv"
OUT = ROOT / "data" / "branches.csv"
API = "https://api.github.com/repos/Duncan-Haywood/oss-monorepo/pulls/{}/commits?per_page=100"


def get(n):
    req = urllib.request.Request(API.format(n), headers={"Accept": "application/vnd.github+json"})
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r), r.headers.get("Link", "")


def main():
    rows = list(csv.DictReader(open(PRS)))
    nums = sorted(int(r["number"]) for r in rows if r["merged_at"])
    done = {}
    if OUT.exists():
        done = {int(r["number"]): r for r in csv.DictReader(open(OUT))}
    for n in nums:
        if n in done:
            continue
        commits, link = get(n)
        if not commits:
            continue
        # earliest by either clock: author date is when the work was written, committer date when it was last rewritten
        times = [min(c["commit"]["author"]["date"], c["commit"]["committer"]["date"]) for c in commits]
        done[n] = dict(number=n, first_commit=min(times), n_commits=len(commits), truncated=int('rel="next"' in link))
        print(n, done[n]["first_commit"], file=sys.stderr)
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["number", "first_commit", "n_commits", "truncated"])
        w.writeheader()
        for n in sorted(done):
            r = done[n]
            w.writerow({k: r[k] for k in w.fieldnames})


if __name__ == "__main__":
    main()
