#!/usr/bin/env python3
"""Keep a shallow clone's history fetchable after a `--shallow-since` fetch.

Seen in this repository's cloud clones (git 2.43, GitHub, 2026-11-14): after a
first `git fetch --shallow-since=<date> origin main`, `.git/shallow` can name a
commit the fetch never sent and no fetched commit has as a parent. Every later
deepening fetch (`--shallow-since`, `--deepen`, `--depth`) then dies with

    fatal: error in object: unshallow <sha>

so a tool that fetches more history (quality queue, claim checks, allocate's
7-day counts) silently reads a short history, and a by-hand
`git fetch --deepen=500 origin main` fails too. Reproduced from a fresh
`git fetch --depth=1` clone: depth 1, then `--shallow-since='7 hours ago'`
(ok), then `--shallow-since=<2 days ago>` (fails, rc 128). Dropping the
entries whose object is absent makes the next fetch work (891 commits).

An entry for an absent object means nothing locally (no commit to graft), so
removing it cannot hide history.

    python3 platform/ci/shallow_repair.py            # repair this clone (and a stale shallow.lock), print what was dropped
    python3 platform/ci/shallow_repair.py --check    # exit 1 if a repair is needed

In code: `fetch([...fetch args...], cwd)` repairs, fetches, and retries once if
git still names an `unshallow` object, then repairs again so the next
fetch (yours or a by-hand one) starts clean.

A timed-out fetch must not leave `.git/shallow.lock` behind. `subprocess.run`
ends a timed-out child with SIGKILL, which skips git's lock cleanup, so every
later fetch died with "Unable to create '.git/shallow.lock': File exists"
until someone deleted it by hand (two run records, 2026-11-16 and 11-18,
after allocate.py's 50 s fetch timed out; reproduced here with a 4 s timeout
on a `--shallow-since` fetch). `run_gently` sends SIGTERM to the fetch's
process group instead, which git handles by removing its locks (reproduced:
no lock left), and `clear_stale_lock` drops a lock that no running git process
in this repository can own, so a lock an earlier run left is cleared too.
`fetch` does both.
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def shallow_file(cwd=ROOT, run=subprocess.run) -> Path | None:
    out = run(["git", "rev-parse", "--git-path", "shallow"], cwd=cwd, capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip():
        return None
    p = Path(out.stdout.strip())
    return p if p.is_absolute() else Path(cwd) / p


def missing_entries(cwd=ROOT, run=subprocess.run) -> list[str]:
    """Shallow entries whose commit object is not in this clone."""
    f = shallow_file(cwd, run)
    if f is None or not f.is_file():
        return []
    shas = f.read_text().split()
    if not shas:
        return []
    # One batch call, not one process per entry.
    out = run(["git", "cat-file", "--batch-check=%(objectname)"], cwd=cwd, input="\n".join(shas) + "\n",
              capture_output=True, text=True)
    missing = {line.split()[0] for line in out.stdout.splitlines() if line.endswith(" missing")}
    return [s for s in shas if s in missing]


def repair(cwd=ROOT, run=subprocess.run) -> list[str]:
    """Drop shallow entries for absent objects; return the dropped shas. Fail-soft: [] on any error."""
    try:
        bad = missing_entries(cwd, run)
        if not bad:
            return []
        f = shallow_file(cwd, run)
        keep = [s for s in f.read_text().split() if s not in set(bad)]
        tmp = f.with_name(f.name + ".repair")
        tmp.write_text("".join(s + "\n" for s in keep))
        os.replace(tmp, f)
        return bad
    except (OSError, subprocess.SubprocessError, AttributeError):
        return []


def run_gently(cmd, cwd=None, timeout=None, input=None, grace=10, **_ignored) -> subprocess.CompletedProcess:
    """`subprocess.run(cmd, capture_output=True, text=True)`, but a timeout sends SIGTERM to the
    whole process group (git and the helpers it forks), waits up to `grace` seconds, and only then
    SIGKILLs. git removes its lock files on SIGTERM, not on SIGKILL. Raises TimeoutExpired like
    subprocess.run, so callers keep their own handling."""
    p = subprocess.Popen(cmd, cwd=cwd, stdin=subprocess.PIPE if input is not None else None,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                         start_new_session=True)
    try:
        out, err = p.communicate(input=input, timeout=timeout)
    except subprocess.TimeoutExpired:
        for sig, wait in ((signal.SIGTERM, grace), (signal.SIGKILL, None)):
            try:
                os.killpg(p.pid, sig)
            except (ProcessLookupError, PermissionError):
                pass
            try:
                p.communicate(timeout=wait)
                break
            except subprocess.TimeoutExpired:
                continue
        raise subprocess.TimeoutExpired(cmd, timeout)
    return subprocess.CompletedProcess(cmd, p.returncode, out, err)


def _git_dir(cwd) -> Path | None:
    try:
        out = subprocess.run(["git", "rev-parse", "--absolute-git-dir"], cwd=cwd,
                             capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    return Path(out.stdout.strip()) if out.returncode == 0 and out.stdout.strip() else None


def git_processes_in(top: Path, proc=Path("/proc")) -> list[int] | None:
    """Pids of running git processes whose working directory is `top` or below it, or None when
    this system has no /proc to ask (then nothing is treated as stale)."""
    if not proc.is_dir():
        return None
    top = top.resolve()
    pids = []
    for d in proc.iterdir():
        if not d.name.isdigit() or int(d.name) == os.getpid():
            continue
        try:
            if not (d / "comm").read_text().strip().startswith("git"):
                continue
            where = Path(os.readlink(d / "cwd")).resolve()
        except OSError:
            continue
        if where == top or top in where.parents:
            pids.append(int(d.name))
    return pids


def clear_stale_lock(cwd=ROOT, name="shallow.lock") -> bool:
    """Remove `.git/<name>` when no git process is running in this repository, so it can only be
    a lock a killed fetch left. A git started meanwhile meets the existing lock and fails rather
    than taking it, so removing it cannot pull a lock from under a live process. True when it
    removed one. Fail-soft: False on any doubt."""
    try:
        gd = _git_dir(cwd)
        lock = gd / name if gd else None
        if lock is None or not lock.exists():
            return False
        live = git_processes_in(gd.parent if gd.name == ".git" else gd)
        if live is None or live:
            return False
        lock.unlink()
        return True
    except OSError:
        return False


def fetch(args: list[str], cwd=ROOT, timeout=None, run=subprocess.run) -> subprocess.CompletedProcess:
    """`git fetch <args>`, robust to the bogus-shallow-entry failure and to a shallow.lock a killed
    fetch left. Raises what subprocess.run raises (TimeoutExpired included), so callers keep their
    own timeout handling; with the default `run`, a timeout terminates git gently (`run_gently`)."""
    # Only the real subprocess.run is swapped for run_gently: a test that patches subprocess.run
    # (allocate's do) must still see the fetch, not have Popen reach the network behind it.
    fetcher = run_gently if run is subprocess.run and isinstance(run, types.FunctionType) else run

    def once():
        return fetcher(["git", "fetch", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if clear_stale_lock(cwd):
        print("(removed a stale .git/shallow.lock: no git process was running in this clone)", file=sys.stderr)
    repair(cwd, run)
    done = once()
    if done.returncode != 0 and "unshallow" in (done.stderr or "") and repair(cwd, run):
        done = once()
    repair(cwd, run)
    return done


def main(argv=None, cwd=ROOT) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if "--check" in argv:
        bad = missing_entries(cwd)
        for s in bad:
            print(f"shallow entry for an absent commit: {s}")
        return 1 if bad else 0
    if clear_stale_lock(cwd):
        print("removed a stale .git/shallow.lock (no git process was running in this clone)")
    bad = repair(cwd)
    print(f"dropped {len(bad)} shallow entr{'y' if len(bad) == 1 else 'ies'} for absent commits"
          + (": " + ", ".join(s[:12] for s in bad) if bad else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
