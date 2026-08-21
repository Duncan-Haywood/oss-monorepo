#!/usr/bin/env python3
"""Fetch each mirror's *full* commit history, so calibration is not limited to the window.

[`README.md`](README.md) result 3 ends with a build requirement that the backtest
produced and the source measurement did not:

> Calibrate on full history, not on the observation window. [...] A production
> version clones full history for calibration and uses the observation window
> only for evaluation.

`detect_silence.py` cannot do that on its own. It reads
[`register-change-rate`](../../../research/register-change-rate/README.md)'s saved
records, and those come from a `--shallow-since` clone of the 180-day window plus
30 days' margin. Every gap earlier than that was never fetched, so the detector's
history genuinely begins on the window's first day — which is why it reports
cold-start alarms as an artifact.

This script fetches the missing half. It clones each mirror's whole history
(blobless, no checkout) and records the **distinct UTC days carrying a
non-merge commit**, for all time. That is the only input `detect_silence.py`
needs in order to start the window already calibrated.

Why this is the decisive experiment rather than a tidy-up: the probe's headline
negative result is that the two sources that went quiet are exactly the two with
no derivable threshold, because each shows a single in-window gap. "A single
in-window gap" is a statement about the clone depth as much as about the source.
If full history makes those two calibratable, the generalisation in README result
1 is scoped to cold monitors rather than true of the rule, and the mandatory
fallback in result 2 is mandatory only for a source genuinely new to the world.
That is worth one clone to find out.

Method note, and the reason the output is checkable: `register-change-rate`
derives change days from `git log --no-merges --no-renames --name-only`, i.e.
days on which a non-merge commit touched a path. This script drops `--name-only`
(so no tree walk and no lazy blob fetch) and takes days on which a non-merge
commit exists. Those coincide unless a commit touches no path at all, so the run
re-derives the in-window days from its own full clone and compares them against
the saved records source-by-source; the comparison is written into the output as
`window_agreement` and printed. A disagreement invalidates the pre-window numbers
for that source and is reported rather than smoothed over.

House rules (`portfolio/research/README.md`): read-only, standard library only,
no credentials, publishes nothing, registers nothing, cannot spend money. The
only network calls are anonymous `git clone` against public repositories, the
same transport surface `register-change-rate` established as reachable.

Usage:
    python3 fetch_prior_history.py --json prior-history-YYYY-MM-DD.json
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_RESULTS = (
    Path(__file__).resolve().parents[3]
    / "research"
    / "register-change-rate"
    / "results-2026-08-20.json"
)

# Full history of a six-figure-file mirror is a bigger walk than the windowed
# clone `register-change-rate` budgeted 240s for, so the budget is raised rather
# than inherited. A timeout is still recorded as a fact about the mirror, not
# retried into.
CLONE_TIMEOUT_S = 900

GIT_LOG_FORMAT = "--format=%at"


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 120) -> tuple[int, str, str]:
    """Run a command, killing the whole process group on timeout.

    `subprocess.run(timeout=…)` kills only the direct child. `git clone` forks a
    `git remote-https` helper that inherits the pipes, so killing the clone alone
    leaves the helper holding stdout and the follow-up read blocks forever. This
    is `register-change-rate`'s finding; repeated here because this script clones
    deeper and would hit it harder.
    """
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            proc.kill()
        proc.communicate()
        raise
    return proc.returncode, out, err


def commit_days(timestamps: list[int]) -> list[str]:
    """Distinct UTC days carrying a commit, ascending, as ISO dates."""
    return sorted({datetime.fromtimestamp(ts, timezone.utc).date().isoformat() for ts in timestamps})


def days_in_window(timestamps: list[int], since_ts: int, until_ts: int) -> set[str]:
    """In-window commit days under exactly `register-change-rate`'s own filter.

    The bound matters and is not a detail. `until_ts` is midnight *starting* the
    window's last calendar day, and the filter is inclusive on both ends, so the
    saved records effectively stop at the end of the day before. Comparing on
    date strings instead admits that whole final day, which manufactured a
    one-day disagreement on exactly the four mirrors that commit most days — the
    only ones with a commit there to find. Same filter, or the comparison
    measures the filter rather than the data.
    """
    return {
        datetime.fromtimestamp(ts, timezone.utc).date().isoformat()
        for ts in timestamps
        if since_ts <= ts <= until_ts
    }


def collect_repo(repo: str, workdir: Path) -> dict:
    """Clone a mirror's full history and record its commit days."""
    url = f"https://github.com/{repo}"
    dest = workdir / repo.replace("/", "__")
    started = time.monotonic()

    try:
        code, _, err = run(
            [
                "git",
                "clone",
                "--quiet",
                "--filter=blob:none",
                "--no-checkout",
                url,
                str(dest),
            ],
            timeout=CLONE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        return {
            "repo": repo,
            "status": "clone_timeout",
            "error": f"full blobless clone exceeded {CLONE_TIMEOUT_S}s",
            "clone_seconds": round(time.monotonic() - started, 1),
        }
    if code != 0:
        return {
            "repo": repo,
            "status": "clone_failed",
            "error": err.strip()[:400],
            "clone_seconds": round(time.monotonic() - started, 1),
        }

    # No `--name-only`: this script needs when a commit happened, not what it
    # touched, and asking for paths on a blobless clone is what made the source
    # probe's first run re-fetch every blob the filter existed to skip.
    code, out, err = run(
        ["git", "log", "--no-merges", GIT_LOG_FORMAT],
        cwd=dest,
        timeout=CLONE_TIMEOUT_S,
    )
    if code != 0:
        return {
            "repo": repo,
            "status": "log_failed",
            "error": err.strip()[:400],
            "clone_seconds": round(time.monotonic() - started, 1),
        }

    timestamps = [int(line) for line in out.split() if line.strip().isdigit()]
    days = commit_days(timestamps)
    return {
        "repo": repo,
        "status": "ok",
        "total_commits": len(timestamps),
        "change_days": days,
        "first_change": days[0] if days else None,
        "last_change": days[-1] if days else None,
        "clone_seconds": round(time.monotonic() - started, 1),
        # Kept out of the written record: 118k timestamps for one mirror would
        # dwarf the days the detector actually consumes. Used for the agreement
        # check below and then dropped.
        "_timestamps": timestamps,
    }


def window_agreement(entry: dict, saved_days: set[str], since_ts: int, until_ts: int) -> dict:
    """Compare this clone's in-window days against the saved records'.

    The two are derived differently — commit days here, path-touching days there
    — so agreeing is the evidence that the pre-window days this script adds are
    the same kind of number as the in-window ones the detector already trusts.
    A disagreement means they are not, and the pre-window days for that source
    should not be fed to the detector.
    """
    if entry.get("status") != "ok":
        return {"comparable": False, "reason": entry.get("status")}
    mine = days_in_window(entry["_timestamps"], since_ts, until_ts)
    return {
        "comparable": True,
        "agrees": mine == saved_days,
        "in_window_here": len(mine),
        "in_window_saved": len(saved_days),
        "only_here": sorted(mine - saved_days),
        "only_saved": sorted(saved_days - mine),
    }


def saved_window_days(payload: dict) -> dict[str, set[str]]:
    """Per-repo in-window change days from the saved records."""
    since_ts = payload["window"]["since_ts"]
    until_ts = payload["window"]["until_ts"]
    days_by_repo = {}
    for entry in payload["repos"]:
        if entry.get("status") != "ok":
            continue
        days_by_repo[entry["repo"]] = days_in_window(
            [c["ts"] for c in entry["commits"]], since_ts, until_ts
        )
    return days_by_repo


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--results", default=str(DEFAULT_RESULTS))
    parser.add_argument("--json", help="write the fetched history here")
    parser.add_argument(
        "--repo",
        action="append",
        help="fetch only this repo (repeatable); default is every ok repo in --results",
    )
    args = parser.parse_args(argv)

    payload = json.loads(Path(args.results).read_text())
    since_ts = payload["window"]["since_ts"]
    until_ts = payload["window"]["until_ts"]
    saved = saved_window_days(payload)
    targets = args.repo or sorted(saved)

    out = {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_measurement": payload.get("measured_at"),
        "window": {
            "since": datetime.fromtimestamp(since_ts, timezone.utc).date().isoformat(),
            "until": datetime.fromtimestamp(until_ts, timezone.utc).date().isoformat(),
            "since_ts": since_ts,
            "until_ts": until_ts,
        },
        "repos": [],
    }

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for repo in targets:
            print(f"… {repo}", file=sys.stderr, flush=True)
            entry = collect_repo(repo, workdir)
            entry["window_agreement"] = window_agreement(
                entry, saved.get(repo, set()), since_ts, until_ts
            )
            entry.pop("_timestamps", None)
            out["repos"].append(entry)
            _print_row(entry)

    if args.json:
        Path(args.json).write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.json}", file=sys.stderr)

    disagreed = [
        e["repo"]
        for e in out["repos"]
        if e["window_agreement"].get("comparable") and not e["window_agreement"]["agrees"]
    ]
    if disagreed:
        print(
            "\nWINDOW DISAGREEMENT (pre-window days unusable for these): "
            + ", ".join(disagreed),
            file=sys.stderr,
        )
    return 0


def _print_row(entry: dict) -> None:
    if entry.get("status") != "ok":
        print(f"  {entry['repo']}: {entry['status']} — {entry.get('error', '')}", file=sys.stderr)
        return
    agree = entry["window_agreement"]
    mark = "ok" if agree.get("agrees") else "MISMATCH"
    print(
        f"  {entry['repo']}: {entry['total_commits']} commits, "
        f"{len(entry['change_days'])} change days since {entry['first_change']} "
        f"({entry['clone_seconds']}s, window {mark})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
