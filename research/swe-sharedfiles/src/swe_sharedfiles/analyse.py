"""Shared-file collision exposure from first-parent merge history. Standard library only."""
import re
import subprocess
from statistics import median

SHARED = ("research/README.md", "research/_homepage/projects.json")


def read_history(since, ref="origin/main", repo="."):
    """One (unix_time, subject, set_of_files) per first-parent commit touching research/."""
    out = subprocess.run(
        ["git", "-C", repo, "log", ref, "--first-parent", f"--since={since}",
         "--format=@@%ct|%s", "--name-only", "--", "research"],
        check=True, capture_output=True, text=True).stdout
    rows, cur = [], None
    for line in out.splitlines():
        if line.startswith("@@"):
            t, s = line[2:].split("|", 1)
            cur = (int(t), s, set())
            rows.append(cur)
        elif line and cur is not None:
            cur[2].add(line)
    return sorted(rows, key=lambda r: r[0])


def shared_times(rows, files=SHARED):
    """Times of merges that touch any of `files`."""
    return [t for t, _, fs in rows if fs & set(files)]


def share(rows, f):
    return sum(1 for _, _, fs in rows if f in fs) / len(rows)


def gaps_minutes(times):
    return [(b - a) / 60 for a, b in zip(times, times[1:])]


def exposure(times, window_min):
    """Share of shared-file merges that had another shared-file merge land in the
    `window_min` minutes before them: a PR open that long would have found the file moved."""
    w = window_min * 60
    hit = 0
    for i, t in enumerate(times):
        if any(t - w <= u < t for u in times[:i]):
            hit += 1
    return hit / len(times) if times else float("nan")


def mean_moves(times, window_min):
    """Mean number of earlier shared-file merges inside the window."""
    w = window_min * 60
    return sum(sum(1 for u in times[:i] if t - w <= u < t) for i, t in enumerate(times)) / len(times)


def summary(rows):
    ts = shared_times(rows)
    g = gaps_minutes(ts)
    return {"merges": len(rows), "shared": len(ts),
            "readme": share(rows, SHARED[0]), "projects": share(rows, SHARED[1]),
            "median_gap": median(g), "gap_lt10": sum(x < 10 for x in g) / len(g),
            "gap_lt30": sum(x < 30 for x in g) / len(g)}


def _git(repo, *a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True)


def shared_commits(since, ref="origin/main", repo=".", files=SHARED):
    """(time, sha) of first-parent commits touching `files`, oldest first."""
    out = _git(repo, "log", ref, "--first-parent", f"--since={since}", "--format=%ct %H", "--", *files).stdout
    return sorted((int(l.split()[0]), l.split()[1]) for l in out.splitlines())


def conflicts(a, b, repo="."):
    """Replay later commit b as if its branch left from a's parent, then merge with a.
    Returns the set of conflicting paths (empty if clean)."""
    base = _git(repo, "rev-parse", a + "^").stdout.strip()
    t = _git(repo, "merge-tree", "--write-tree", f"--merge-base={b}^", base, b)
    if t.returncode != 0:
        return set(re.findall(r"Merge conflict in (\S+)", t.stdout)) or {"?"}
    tree = t.stdout.split()[0]
    bp = _git(repo, "commit-tree", tree, "-p", base, "-m", "replay").stdout.strip()
    m = _git(repo, "merge-tree", "--write-tree", a, bp)
    if m.returncode == 0:
        return set()
    return set(re.findall(r"Merge conflict in (\S+)", m.stdout)) or {"?"}


def replay_conflict_rate(commits, window_min, repo="."):
    """Over ordered pairs (a earlier, b later, gap <= window): (pairs, pairs conflicting anywhere,
    pairs conflicting in a shared file)."""
    tot = bad = bad_shared = 0
    for i, (tb, b) in enumerate(commits):
        for ta, a in commits[:i]:
            if 0 < tb - ta <= window_min * 60:
                tot += 1
                c = conflicts(a, b, repo)
                bad += bool(c)
                bad_shared += bool(c & set(SHARED))
    return tot, bad, bad_shared
