"""Real pull-request lifetimes and per-PR replay conflicts. Standard library only."""
import csv
import re
import subprocess
from datetime import datetime, timezone
from statistics import median

SHARED = ("research/README.md", "research/_homepage/projects.json")
PR_RE = re.compile(r"\(#(\d+)\)\s*$|^Merge pull request #(\d+) ")


def ts(s):
    return int(datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())


def read_prs(path):
    """{number: (created_unix, merged_unix, head_repo)} for merged PRs."""
    out = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            if r["merged_at"]:
                out[int(r["number"])] = (ts(r["created_at"]), ts(r["merged_at"]), r["head_repo"])
    return out


def _git(repo, *a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True)


def research_merges(since_unix, ref="origin/main", repo="."):
    """First-parent commits touching research/ since `since_unix`:
    list of dicts(sha, time, pr, files), oldest first. pr is None if the subject names none."""
    out = _git(repo, "log", ref, "--first-parent", f"--since={since_unix}",
               "--format=@@%H|%ct|%s", "--name-only", "--", "research").stdout
    rows, cur = [], None
    for line in out.splitlines():
        if line.startswith("@@"):
            sha, t, s = line[2:].split("|", 2)
            m = PR_RE.search(s)
            cur = dict(sha=sha, time=int(t), pr=int(m.group(1) or m.group(2)) if m else None, files=set())
            rows.append(cur)
        elif line and cur is not None:
            cur["files"].add(line)
    return sorted(rows, key=lambda r: r["time"])


def base_at(t, ref="origin/main", repo="."):
    """Last first-parent commit on `ref` at or before unix time t (where a branch cut then would start)."""
    return _git(repo, "rev-list", "-1", "--first-parent", f"--before={t + 1}", ref).stdout.strip()


def conflicts(sha, base, repo="."):
    """Replay the merged commit `sha` as a branch cut from `base`: apply sha's own diff onto base,
    then three-way merge that with sha's parent (what main was just before the merge).
    Returns the set of conflicting paths (empty if clean)."""
    parent = sha + "^"
    t = _git(repo, "merge-tree", "--write-tree", f"--merge-base={parent}", base, sha)
    if t.returncode != 0:
        return set(re.findall(r"Merge conflict in (\S+)", t.stdout)) or {"?"}
    tree = t.stdout.split()[0]
    bp = _git(repo, "commit-tree", tree, "-p", base, "-m", "replay").stdout.strip()
    m = _git(repo, "merge-tree", "--write-tree", parent, bp)
    if m.returncode == 0:
        return set()
    return set(re.findall(r"Merge conflict in (\S+)", m.stdout)) or {"?"}


def pctl(xs, q):
    xs = sorted(xs)
    if not xs:
        return float("nan")
    k = (len(xs) - 1) * q
    lo = int(k)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return (c - h, c + h)


def join(merges, prs):
    """Merges with a known PR in prs (same-repo heads only), plus the counts dropped."""
    kept, no_pr, unknown, fork = [], 0, 0, 0
    for m in merges:
        if m["pr"] is None:
            no_pr += 1
        elif m["pr"] not in prs:
            unknown += 1
        else:
            c, mg, head = prs[m["pr"]]
            if head and not head.lower().startswith("duncan-haywood/"):
                fork += 1
                continue
            kept.append(dict(m, created=c, merged=mg))
    return kept, no_pr, unknown, fork


def landings_during(me, merges):
    """Number of other shared-file merges (from all `merges`) landing on main from PR `me`'s
    creation up to, but not including, its own merge commit."""
    return sum(1 for o in merges
               if o["sha"] != me["sha"] and set(o["files"]) & set(SHARED) and me["created"] <= o["time"] < me["time"])


def lifetimes_min(kept):
    return [max(0, k["merged"] - k["created"]) / 60 for k in kept]
