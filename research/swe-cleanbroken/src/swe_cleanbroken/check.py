"""Replay pairs of merges and check the merged tree against the research homepage's rules.

Standard library plus git 2.38 or later. The consistency rules are those of
research/_homepage/build.py validate(), re-implemented on a git tree rather than on the working
copy, plus a duplicate-bullet check that build.py does not make.
"""
import json
import re
import subprocess

BULLET = re.compile(r"^- \[`research/([\w-]+)`\]\([^)]*\)\s*[—-]+\s*(.+)$", re.M)


def git(repo, *a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True)


def replay(a, b, repo="."):
    """Re-apply later commit b onto earlier commit a's parent, then merge with a.
    Returns (tree_sha or None, conflicting_paths). The tree is None when git reports a conflict."""
    base = git(repo, "rev-parse", a + "^").stdout.strip()
    t = git(repo, "merge-tree", "--write-tree", f"--merge-base={b}^", base, b)
    if t.returncode != 0:
        return None, set(re.findall(r"Merge conflict in (\S+)", t.stdout)) or {"?"}
    bp = git(repo, "commit-tree", t.stdout.split()[0], "-p", base, "-m", "replay").stdout.strip()
    m = git(repo, "merge-tree", "--write-tree", a, bp)
    if m.returncode != 0:
        return None, set(re.findall(r"Merge conflict in (\S+)", m.stdout)) or {"?"}
    return m.stdout.split()[0], set()


def tree_errors(tree, repo="."):
    """Consistency errors of a tree, as (kind, detail) pairs."""
    try:
        data = json.loads(git(repo, "show", f"{tree}:research/_homepage/projects.json").stdout)
    except ValueError as e:
        return [("projects.json invalid JSON", str(e)[:60])]
    entries = git(repo, "ls-tree", tree, "research/").stdout.splitlines()
    projects = set()
    for line in entries:
        meta, path = line.split("\t", 1)
        name = path.split("/", 1)[1]
        if meta.split()[1] == "tree" and name[0] not in "_.":
            projects.add(name)
    listed = [p["slug"] for t in data["themes"] for p in t["projects"]]
    bullets = [s for s, _ in BULLET.findall(git(repo, "show", f"{tree}:research/README.md").stdout)]
    errs = []
    errs += [("json missing project", s) for s in sorted(projects - set(listed))]
    errs += [("json nonexistent project", s) for s in sorted(set(listed) - projects)]
    errs += [("json duplicate slug", s) for s in sorted({s for s in listed if listed.count(s) > 1})]
    errs += [("readme missing bullet", s) for s in sorted(projects - set(bullets))]
    errs += [("readme bullet for nonexistent", s) for s in sorted(set(bullets) - projects)]
    errs += [("readme duplicate bullet (not caught by build.py)", s)
             for s in sorted({s for s in bullets if bullets.count(s) > 1})]
    errs += [("json featured not listed", s) for s in data.get("featured", []) if s not in listed]
    return errs


def classify(a, b, repo="."):
    """('conflict', paths) | ('broken', errors) | ('ok', [])."""
    tree, paths = replay(a, b, repo)
    if tree is None:
        return "conflict", sorted(paths)
    # Errors already present in either original commit are not caused by the merge.
    old = set(tree_errors(a + "^{tree}", repo)) | set(tree_errors(b + "^{tree}", repo))
    errs = [e for e in tree_errors(tree, repo) if e not in old]
    return ("broken", errs) if errs else ("ok", [])


def pairs(commits, window_min):
    """Ordered pairs (a earlier, b later) with 0 < gap <= window; commits are (time, sha)."""
    return [(a, b) for i, (tb, b) in enumerate(commits) for ta, a in commits[:i]
            if 0 < tb - ta <= window_min * 60]
