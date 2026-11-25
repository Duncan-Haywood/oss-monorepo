#!/usr/bin/env python3
"""Has someone already shipped, or started, this venture slug or fix?

Open-PR searches cannot see a sibling session that merged ten minutes ago
(prompts/process/backlog/P002). This reads only git, so it works in a shallow
web-session clone with no token.

  python3 platform/ci/slug_dupe.py <slug> [--days 14] [--remote origin] [--no-fetch] [--budget 30]

It refreshes <remote>/main first (fetch_ref.py, keeping at least --days of
history), because the clone's own ref can be hours old: on 2026-11-25 a run
checked a stale origin/main, found nothing, and its duplicate had merged in
the meantime (PR #18769). In a shallow clone the refresh also makes the
--days window real instead of whatever history the clone happened to hold.
The tip comes first and is cheap; the deepen to --days is bounded by
--budget seconds (default 30; it took 49 s in a fresh clone), and when it
runs out the window actually searched is printed. --no-fetch reads the ref
as it is.

Exit 1: `ventures/<slug>` is already on origin/main, or a commit naming the
slug landed there within --days. Extend that work instead of duplicating it.
Exit 0: neither; any other branches whose name contains the slug are listed as
a notice (another session may be building it right now: check its PR).
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_ref  # noqa: E402


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.returncode, r.stdout


def check(slug, days=14, remote="origin", ref=None):
    """Return (on_main, recent_commits, other_branches)."""
    ref = ref or f"{remote}/main"
    if git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")[0] != 0:
        # Without the ref both searches come back empty, which would read as "no duplicate".
        raise RuntimeError(f"{ref} not found: run `python3 platform/ci/fetch_ref.py main --remote {remote}` first")
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


def refresh(remote="origin", days=14, budget=30.0):
    """Bring <remote>/main to its tip, then deepen it to `days` within `budget` seconds.

    The tip is what catches a sibling that merged after the clone was made (PR #18769),
    and it costs only the new commits. Deepening a fresh cloud clone to 14 days took
    49 s (919 -> 4,325 commits, 2026-11-25), past the 60 s some runs give the whole
    command, so it is bounded; when it runs out, the window actually searched is
    printed instead of being passed off as --days."""
    rc, top = git("rev-parse", "--show-toplevel")
    cwd = top.strip()
    # days=0: fetch back no further than the history the clone already holds.
    if rc != 0 or fetch_ref.fetch_ref("main", remote, days=0, cwd=cwd, out=sys.stderr) == 1:
        print(f"warning: could not refresh {remote}/main; reading the local ref, "
              "which may be stale", file=sys.stderr)
        return
    if not fetch_ref.is_shallow(cwd):
        return
    cutoff = time.time() - days * 86400
    old = fetch_ref.oldest([f"{remote}/main"], cwd)
    if old is not None and old <= cutoff:
        return
    try:
        fetch_ref.fetch_ref("main", remote, days=days, cwd=cwd, out=sys.stderr,
                            timeout=budget or None)
    except subprocess.TimeoutExpired:
        old = fetch_ref.oldest([f"{remote}/main"], cwd)
        since = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(old)) if old else "unknown"
        print(f"note: {remote}/main is at its tip, but deepening to {days} days took over "
              f"{budget:g} s, so commits were searched back to {since} only. For the full "
              f"window run with --budget 0 (in the background: about a minute the first time).",
              file=sys.stderr)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("slug")
    p.add_argument("--days", type=int, default=14)
    p.add_argument("--remote", default="origin")
    p.add_argument("--no-fetch", action="store_true", help="do not refresh <remote>/main first")
    p.add_argument("--budget", type=float, default=30,
                   help="seconds the shallow-clone deepen to --days may take (0: no limit)")
    a = p.parse_args(argv)
    if not a.slug or any(c in a.slug for c in "*?[]/\\ ") or a.slug.startswith("-"):
        # An empty slug greps every commit and lists all of ventures/: always "duplicate".
        print(f"not a venture slug: {a.slug!r}", file=sys.stderr)
        return 2
    if not a.no_fetch:
        refresh(a.remote, a.days, a.budget)
    try:
        on_main, commits, branches = check(a.slug, a.days, a.remote)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
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
