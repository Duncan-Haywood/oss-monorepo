"""Find review-track pull requests in `git log` output and group the ones that landed together.

Pure standard library. A review PR is a squash commit on `main` whose subject is
`prompts: review ... (#N)`. Two reviews 'cluster' when consecutive merges are at most
`window` minutes apart; a cluster of two or more is a set of parallel review sessions
that each opened and merged their own PR.
"""
import datetime as D
import glob
import json
import os
import re

REVIEW = re.compile(r"^prompts: review .*\(#(\d+)\)$")
LOG_FORMAT = "@@%H|%cI|%s"


def parse_log(text):
    """Parse `git log --format=LOG_FORMAT --name-only` into dicts with sha, time, subject, files."""
    out, cur = [], None
    for line in text.splitlines():
        if line.startswith("@@"):
            sha, t, subject = line[2:].split("|", 2)
            cur = {"sha": sha, "time": D.datetime.fromisoformat(t), "subject": subject, "files": []}
            out.append(cur)
        elif line.strip() and cur is not None:
            cur["files"].append(line.strip())
    return out


def review_prs(commits):
    """Review squash commits, oldest first, each with its PR number and the files outside prompts/runs/."""
    rows = []
    for c in commits:
        m = REVIEW.match(c["subject"])
        if m:
            rows.append(dict(c, pr=int(m.group(1)),
                             changed=[f for f in c["files"] if not f.startswith("prompts/runs/")]))
    rows.sort(key=lambda r: r["time"])
    return rows


def clusters(rows, window):
    """Group consecutive rows whose merge times are at most `window` minutes apart."""
    groups = []
    for r in rows:
        if groups and (r["time"] - groups[-1][-1]["time"]).total_seconds() <= window * 60:
            groups[-1].append(r)
        else:
            groups.append([r])
    return groups


def shared_files(group):
    """Files (outside prompts/runs/) edited by at least two PRs of a cluster."""
    seen, both = set(), set()
    for r in group:
        for f in set(r["changed"]):
            (both if f in seen else seen).add(f)
    return sorted(both)


def load_records(runs_dir):
    """Run records by the number of the pull request they name (this repository's `/pull/N` only)."""
    by_pr = {}
    for f in glob.glob(os.path.join(runs_dir, "*.json")):
        try:
            r = json.load(open(f))
        except ValueError:
            continue
        if not isinstance(r, dict):
            continue
        m = re.search(r"/oss-monorepo/pull/(\d+)", str(r.get("pr") or ""), re.I)
        if m:
            by_pr.setdefault(int(m.group(1)), r)
    return by_pr


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return ((c - h) / d, (c + h) / d)
