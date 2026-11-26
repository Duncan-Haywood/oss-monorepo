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

It also asks GitHub's search for pull requests with the slug in their title
(`gh api search/issues`, about a second, no token needed for this public repo).
That covers the whole --days window whatever the clone's depth (two runs on
2026-11-26 had the deepen cut to a few hours) and lists open PRs, so the
separate open-PR search is only needed for a keyword that is not in titles.
When gh cannot answer it says so and the git checks stand alone; --no-search skips it.

Exit 1: `ventures/<slug>` is already on origin/main, or a commit naming the
slug landed there within --days, or a PR titled with it merged within --days. Extend that work instead of duplicating it.
Exit 0: none of these; other branches whose name contains the slug, and open
PRs titled with it, are listed as a notice (another session may be building it right now: check its PR).
"""
import argparse
import datetime as dt
import json
import re
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


def repo_of(remote="origin"):
    """`owner/name` of a GitHub remote (https, ssh or the cloud proxy's /git/ URL), else None."""
    rc, url = git("remote", "get-url", remote)
    m = re.search(r"github\.com[:/]([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", url.strip()) if rc == 0 else None
    if m is None and rc == 0:
        m = re.search(r"/git/([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", url.strip())
    return f"{m.group(1)}/{m.group(2)}" if m else None


def search_prs(slug, days, repo, run=subprocess.run, today=None):
    """(merged, open) PRs whose title contains `slug`, merged or still open within `days`,
    as "#N YYYY-MM-DD title" lines; None when the search cannot be made.

    GitHub's search matches words loosely ("follow up weekdays" for follow-up-weekdays),
    so a hit counts only when the title holds the slug itself, case aside."""
    today = today or dt.date.today()
    since = (today - dt.timedelta(days=days)).isoformat()
    q = f'repo:{repo} is:pr in:title "{slug}" updated:>={since}'
    try:
        r = run(["gh", "api", "-X", "GET", "search/issues", "-f", f"q={q}", "-f", "per_page=50"],
                capture_output=True, text=True, timeout=20)
        items = json.loads(r.stdout).get("items", []) if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired, ValueError, AttributeError):
        items = None
    if items is None:
        return None
    merged, open_ = [], []
    for it in items:
        title = it.get("title") or ""
        if slug.lower() not in title.lower():
            continue
        at = ((it.get("pull_request") or {}).get("merged_at") or "")[:10]
        if it.get("state") == "open":
            open_.append(f"#{it['number']} {(it.get('created_at') or '')[:10]} {title}")
        elif at and at >= since:
            merged.append(f"#{it['number']} {at} {title}")
    return merged, open_


def refresh(remote="origin", days=14, budget=30.0):
    """Bring <remote>/main to its tip, then deepen it to `days` within `budget` seconds.

    The tip is what catches a sibling that merged after the clone was made (PR #18769),
    and it costs only the new commits. Deepening a fresh cloud clone to 14 days took
    49 s (919 -> 4,325 commits, 2026-11-25), past the 60 s some runs give the whole
    command, so it is bounded; when it runs out, the window actually searched is
    printed instead of being passed off as --days. Returns that date when the
    deepen ran out, else None."""
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
        return time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(old)) if old else "unknown"
    return None


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("slug")
    p.add_argument("--days", type=int, default=14)
    p.add_argument("--remote", default="origin")
    p.add_argument("--no-fetch", action="store_true", help="do not refresh <remote>/main first")
    p.add_argument("--no-search", action="store_true", help="do not ask GitHub search for PRs titled with the slug")
    p.add_argument("--budget", type=float, default=30,
                   help="seconds the shallow-clone deepen to --days may take (0: no limit)")
    a = p.parse_args(argv)
    if not a.slug or any(c in a.slug for c in "*?[]/\\ ") or a.slug.startswith("-"):
        # An empty slug greps every commit and lists all of ventures/: always "duplicate".
        print(f"not a venture slug: {a.slug!r}", file=sys.stderr)
        return 2
    cut = refresh(a.remote, a.days, a.budget) if not a.no_fetch else None
    try:
        on_main, commits, branches = check(a.slug, a.days, a.remote)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    merged, open_, found = [], [], None
    repo = None if a.no_search else repo_of(a.remote)
    if repo:
        found = search_prs(a.slug, a.days, repo)
        if found is None:
            print("note: GitHub search for PRs was unavailable; open PRs are unchecked "
                  "(search_pull_requests) and the git window above is all that was read", file=sys.stderr)
        else:
            seen = " ".join(commits)
            merged = [m for m in found[0] if f"(#{m.split()[0][1:]})" not in seen]
            open_ = found[1]
    if cut:
        # The deepen is bounded; say what the git search missed, and what covered it.
        covered = (f"PR titles were searched over all {a.days} days on GitHub, so only commits "
                   "outside a slug-titled PR can be missed") if repo and found is not None else \
                  "For the full window run with --budget 0 (in the background: about a minute the first time)"
        print(f"note: {a.remote}/main is at its tip, but deepening to {a.days} days took over "
              f"{a.budget:g} s, so commits were searched back to {cut} only. {covered}.", file=sys.stderr)
    if on_main:
        print(f"ventures/{a.slug} is already on {a.remote}/main: extend it, do not rebuild.")
    for c in commits:
        print(f"landed recently: {c}")
    for m in merged:
        print(f"merged recently: PR {m}")
    for o in open_:
        print(f"notice: open PR {o} names this slug; extend it unless it is your own")
    for b in branches:
        print(f"notice: branch {b} names this slug; check its PR before building")
    if not (on_main or commits or branches or merged or open_):
        print(f"{a.slug}: no duplicate found")
    return 1 if (on_main or commits or merged) else 0


if __name__ == "__main__":
    sys.exit(main())
