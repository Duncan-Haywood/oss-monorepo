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

    python3 platform/ci/shallow_repair.py            # repair this clone, print what was dropped
    python3 platform/ci/shallow_repair.py --check    # exit 1 if a repair is needed

In code: `fetch([...fetch args...], cwd)` repairs, fetches, and retries once if
git still names an `unshallow` object, then repairs again so the next
fetch (yours or a by-hand one) starts clean.
"""
from __future__ import annotations

import os
import subprocess
import sys
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


def fetch(args: list[str], cwd=ROOT, timeout=None, run=subprocess.run) -> subprocess.CompletedProcess:
    """`git fetch <args>`, robust to the bogus-shallow-entry failure. Raises what subprocess.run raises
    (TimeoutExpired included), so callers keep their own timeout handling."""
    def once():
        return run(["git", "fetch", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
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
    bad = repair(cwd)
    print(f"dropped {len(bad)} shallow entr{'y' if len(bad) == 1 else 'ies'} for absent commits"
          + (": " + ", ".join(s[:12] for s in bad) if bad else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
