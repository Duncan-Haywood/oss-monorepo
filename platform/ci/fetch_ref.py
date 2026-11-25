#!/usr/bin/env python3
"""Fetch a branch into a shallow clone without cutting the history it already has.

Why: `git fetch --depth=N` and `git fetch --shallow-since=<date>` do not only
limit what is downloaded. In a shallow clone they move the shallow boundary
to N commits (or <date>) behind the fetched tip, and when that tip sits on
main, main's own history is cut there too. Measured in a cloud clone
(git 2.43, 2026-11-17): after `--shallow-since` had given HEAD 1,091 commits,
the documented `git fetch --depth=40 origin <a PR branch>` left HEAD with 45,
and `--shallow-since=<a day later>` left 373. Every tool that reads history
after that (friction_rank's "touched since", measure, allocate's 7-day counts,
merge bases for run_workflow_locally) silently reads the short window, and a
session that deepened on purpose loses it without a message.

This fetches with `--shallow-since` set no later than the oldest commit HEAD
and origin/main already reach, so the boundary can only move back. A branch
cut from main inside that window arrives whole, at the cost of the new commits
only (about 1 s for a session's branch). `--days` (default 1) is the shortest
window it will settle for, so a fresh depth-1 clone still gets enough of main
to find a session branch's merge base. A clone that is not shallow gets a
plain fetch. A branch whose every commit is older than the window (git refuses
that `--shallow-since`) is fetched with `--shallow-exclude=main`: its own
commits only, so it has no merge base here, and still nothing is cut.

    python3 platform/ci/fetch_ref.py <branch>          # -> origin/<branch>
    python3 platform/ci/fetch_ref.py main              # refresh origin/main
    python3 platform/ci/fetch_ref.py pull/123/head     # a PR's head, as refs/remotes/origin/pr/123
    python3 platform/ci/fetch_ref.py <branch> --days 7 # keep at least a week

Prints the commit counts before and after so a cut would show. Exit 0 on a
good fetch, 1 when git fails, 2 when history got shorter anyway.
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shallow_repair  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def git(cwd, *args, run=subprocess.run):
    return run(["git", *args], cwd=cwd, capture_output=True, text=True)


def is_shallow(cwd=ROOT, run=subprocess.run) -> bool:
    return git(cwd, "rev-parse", "--is-shallow-repository", run=run).stdout.strip() == "true"


def local_revs(remote="origin", cwd=ROOT, run=subprocess.run) -> list[str]:
    out = ["HEAD"]
    if git(cwd, "rev-parse", "--verify", "-q", f"{remote}/main", run=run).returncode == 0:
        out.append(f"{remote}/main")
    return out


def oldest(revs, cwd=ROOT, run=subprocess.run) -> int | None:
    """Unix time of the oldest commit any of `revs` reaches, or None."""
    done = git(cwd, "log", *revs, "--format=%ct", run=run)
    stamps = [int(s) for s in (done.stdout or "").split() if s.isdigit()]
    return min(stamps) if stamps else None


def count(revs, cwd=ROOT, run=subprocess.run) -> int:
    done = git(cwd, "rev-list", "--count", *revs, run=run)
    return int(done.stdout.strip()) if done.stdout.strip().isdigit() else 0


def since_for(old: int | None, days: float, now: dt.datetime | None = None) -> str:
    """The --shallow-since value: no later than `old` (minus a minute of slack)
    and no later than `days` ago. An ISO timestamp, which git reads exactly."""
    now = now or dt.datetime.now(dt.timezone.utc)
    floor = now - dt.timedelta(days=days)
    if old is not None:
        floor = min(floor, dt.datetime.fromtimestamp(old - 60, dt.timezone.utc))
    return floor.strftime("%Y-%m-%dT%H:%M:%SZ")


def refspec(ref: str, remote: str = "origin") -> str:
    m = re.fullmatch(r"(?:refs/)?pull/(\d+)/head", ref)
    if m:
        return f"+refs/pull/{m.group(1)}/head:refs/remotes/{remote}/pr/{m.group(1)}"
    ref = ref.removeprefix("refs/heads/").removeprefix(f"{remote}/")
    return f"+refs/heads/{ref}:refs/remotes/{remote}/{ref}"


def fetch_ref(ref, remote="origin", days=1.0, cwd=ROOT, run=subprocess.run, out=sys.stdout,
              now=None, timeout=None) -> int:
    """`timeout` (seconds) bounds each git fetch; on expiry subprocess.TimeoutExpired is raised
    and the clone keeps the history it had (git discards an interrupted fetch)."""
    spec = refspec(ref, remote)
    if not is_shallow(cwd, run):
        done = shallow_repair.fetch(["-q", remote, spec], cwd=cwd, run=run, timeout=timeout)
        if done.returncode != 0:
            print(f"fetch_ref: git fetch failed:\n{done.stderr.strip()}", file=out)
            return 1
        print(f"fetch_ref: fetched {spec.split(':')[1]} (full clone)", file=out)
        return 0
    revs = local_revs(remote, cwd, run)
    before = count(revs, cwd, run)
    since = since_for(oldest(revs, cwd, run), days, now)
    done = shallow_repair.fetch(["-q", f"--shallow-since={since}", remote, spec], cwd=cwd, run=run,
                                timeout=timeout)
    if done.returncode != 0 and re.search(r"shallow info|no commits selected", done.stderr or ""):
        # git refuses --shallow-since when the whole branch is older than the
        # window ("error processing shallow info: 4" from GitHub, "no commits
        # selected for shallow requests" from a local upload-pack; an old,
        # never-merged branch). Take only the branch's own commits instead: still no cut.
        since = f"the branch's own commits (it predates {since})"
        done = shallow_repair.fetch(["-q", "--shallow-exclude=main", remote, spec], cwd=cwd, run=run,
                                    timeout=timeout)
    if done.returncode != 0:
        print(f"fetch_ref: git fetch back to {since} failed:\n{done.stderr.strip()}", file=out)
        return 1
    after = count(revs, cwd, run)
    print(f"fetch_ref: fetched {spec.split(':')[1]} back to {since}; "
          f"{' + '.join(revs)}: {before} -> {after} commits", file=out)
    if after < before:
        print("fetch_ref: history got shorter; a commit older than its parents' dates may "
              "have cut it. `git fetch --deepen=500 origin main` restores more.", file=out)
        return 2
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("ref", help="branch name, main, or pull/<n>/head")
    ap.add_argument("--remote", default="origin")
    ap.add_argument("--days", type=float, default=1.0,
                    help="keep at least this many days of history (default 1)")
    a = ap.parse_args(argv)
    return fetch_ref(a.ref, a.remote, a.days)


if __name__ == "__main__":
    sys.exit(main())
