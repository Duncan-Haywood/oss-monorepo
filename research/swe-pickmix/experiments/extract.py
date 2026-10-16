"""Rebuild data/projects.tsv from a full-history clone of oss-research-monorepo.

    python3 experiments/extract.py /path/to/oss-research-monorepo > data/projects.tsv

For each research/<slug>/README.md added on a first-parent merge of main: the merge time, the author time of the
earliest commit on the merged branch (an upper bound on when the run started), and the branch's commit count.
"""
import subprocess, sys
from datetime import datetime, timezone

repo = sys.argv[1]


def git(*a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True).stdout


def utc(s):
    return datetime.fromisoformat(s).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


out = git("log", "--first-parent", "--diff-filter=A", "--name-only", "--format=C %H %P %cI", "--", "research/*/README.md")
rows, cur = [], None
for l in out.splitlines():
    if l.startswith("C "):
        _, h, *rest = l.split()
        cur = rest
    elif l.startswith("research/"):
        slug = l.split("/")[1]
        if len(cur) == 3:
            p1, p2, t = cur
            ft = git("log", "--format=%aI", f"{p1}..{p2}").split()
            rows.append((utc(t), slug, utc(min(ft, key=utc)) if ft else "-", len(ft)))
        else:
            rows.append((utc(cur[-1]), slug, "-", 0))
rows.sort()
print("# slug<TAB>merged_utc<TAB>first_branch_commit_utc ('-' = no second parent)<TAB>commits_on_branch. One row per research/<slug>/README.md added on a first-parent merge of oss-research-monorepo main; extracted by experiments/extract.py.")
for m, s, f, n in rows:
    print(f"{s}\t{m}\t{f}\t{n}")
