#!/usr/bin/env python3
"""Has someone already shipped, or started, this venture slug or fix?

Open-PR searches cannot see a sibling session that merged ten minutes ago
(prompts/process/backlog/P002). This reads only git, so it works in a shallow
web-session clone with no token.

  python3 platform/ci/slug_dupe.py <slug> [--days 14] [--remote origin]

Exit 1: `ventures/<slug>` is already on origin/main, or a commit naming the
slug landed there within --days. Extend that work instead of duplicating it.
Exit 0: neither; any other branches whose name contains the slug are listed as
a notice (another session may be building it right now: check its PR).
"""
import argparse
import subprocess
import sys


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.returncode, r.stdout


def check(slug, days=14, remote="origin", ref=None):
    """Return (on_main, recent_commits, other_branches)."""
    ref = ref or f"{remote}/main"
    rc, out = git("ls-tree", "-d", "--name-only", ref, f"ventures/{slug}")
    on_main = rc == 0 and bool(out.strip())
    rc, out = git("log", ref, f"--since={days} days ago", "--fixed-strings",
                  f"--grep={slug}", "--format=%h %ad %s", "--date=short")
    commits = out.splitlines() if rc == 0 else []
    rc, out = git("ls-remote", "--heads", remote, f"*{slug}*")
    branches = [l.split("\t")[1].removeprefix("refs/heads/") for l in out.splitlines()] if rc == 0 else []
    _, cur = git("branch", "--show-current")
    # archive/* only preserves history (research/_mirror/archive.py); nobody is building there.
    return on_main, commits, [b for b in branches if b != cur.strip() and not b.startswith("archive/")]


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("slug")
    p.add_argument("--days", type=int, default=14)
    p.add_argument("--remote", default="origin")
    a = p.parse_args(argv)
    on_main, commits, branches = check(a.slug, a.days, a.remote)
    if on_main:
        print(f"ventures/{a.slug} is already on {a.remote}/main: extend it, do not rebuild.")
    for c in commits:
        print(f"landed recently: {c}")
    for b in branches:
        print(f"notice: branch {b} names this slug; check its PR before building")
    if not (on_main or commits or branches):
        print(f"{a.slug}: no duplicate found")
    return 1 if (on_main or commits) else 0


if __name__ == "__main__":
    sys.exit(main())
