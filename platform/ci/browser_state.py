#!/usr/bin/env python3
"""Say when the browser checks last ran, and whether that reading still stands.

    python3 platform/ci/browser_state.py
    python3 platform/ci/browser_state.py --json
    python3 platform/ci/browser_state.py --require-current   # exits 1 if stale

## Why this exists

`platform/ci/browser_checks.py` runs the seven checks in `platform/pages/`
that no workflow covers during a starvation window, and a whole-site run
takes 20-30 minutes. It prints its verdict to a terminal and then the
terminal goes away. Nothing in the tree records that the run happened, so
the next session has exactly two options: spend the 30 minutes again, or
skip -- and CLAUDE.md records, at length, which one sessions actually pick.
The 48 critical axe `label` violations found on 2026-09-06 had been live for
the whole life of the catalogue for that reason: the guard existed, was
correct, and nobody ran it.

This is the same shape as `pages_state.py --require-current`, and it is here
for the same reason that flag is. CLAUDE.md had carried "refresh the
snapshot" as prose for a day when a session that had read it still left the
snapshot stale. A reminder competes with everything else in a long file; an
exit code does not.

## What a reading is, and what it is not

The whole point of `portfolio/ledger/infra_state.yaml` is that a reading is
not a claim, and the same care applies here -- more so, because unlike a
Pages deployment this cannot be re-derived from an API. It has to be
recorded, so the recording has to be honest about what it covers:

  - **Only an unfiltered run is recorded.** `--only <slug>` is a way to
    verify *less*; `browser_checks.py` already stamps such a run FILTERED
    precisely so it cannot be mistaken for a full one, and writing it here
    as a catalogue reading would launder that back into a lie.
  - **Only the checks that actually ran are recorded**, by name. A
    `--checks contrast` run says nothing about `sweep`, and a reading that
    flattened the two would report the catalogue as swept when no tool had
    been asked to compute.
  - **A skip is never recorded as a pass.** `browser_checks.py` exits 2 when
    a check could not run at all (no Playwright, no axe-core). That is the
    outcome this repository is worst at noticing, so it is not written down
    as anything.

## When a reading goes stale

A reading names the commit it was taken at. If that is not `HEAD`, the
reading is *not* automatically stale: this repository merges documentation,
ledger prose and CI tooling constantly, and none of it changes a rendered
page. Invalidating a 30-minute run on a README edit would train sessions to
ignore this tool, which is the failure it exists to prevent.

So a reading survives commits that touch nothing the built site is made
from, and goes stale the moment one of these does:

    ventures/**            the products themselves
    platform/pages/**      the builder, the chrome, and the checks
    platform/marketing/**  the front door and the mirror

That list is deliberately literal rather than a heuristic. The cost of
being wrong in the lax direction is a real defect shipped unseen; the cost
of being wrong in the strict direction is 30 minutes. When in doubt the
answer is to re-run, and a stale verdict says so.

Staleness is computed with `git diff --name-only`, so a shallow clone that
cannot reach the recorded commit reports `unknown` rather than guessing --
never `current`, which is the direction the 2026-08-30..09-04 "nothing is
served" episode failed in.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
STATE = os.path.join(HERE, "browser_state.json")

# The seven checks browser_checks.py knows about. Duplicated as a literal
# rather than imported so that reading the state file never triggers the
# environment probing browser_checks.py does at import time.
CHECKS = ("sideways", "presets", "roundtrip", "highlight", "contrast", "sweep", "journey")

# A commit touching any of these can change what a browser sees. See the
# module docstring for why this is a literal list and not a heuristic.
SURFACE_PATHS = ("ventures", "platform/pages", "platform/marketing")


def _git(*args: str) -> tuple[int, str]:
    """Run git in the repository, returning (returncode, stdout)."""
    try:
        p = subprocess.run(("git", "-C", REPO) + args, capture_output=True, text=True)
    except OSError:
        return 127, ""
    return p.returncode, p.stdout.strip()


def head_commit() -> str | None:
    rc, out = _git("rev-parse", "HEAD")
    return out if rc == 0 and out else None


def load() -> dict:
    """The recorded readings, or an empty shape when nothing is recorded yet."""
    try:
        with open(STATE, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {"readings": []}
    if not isinstance(data, dict) or not isinstance(data.get("readings"), list):
        # A corrupted file reads as "nothing recorded", never as a pass.
        return {"readings": []}
    return data


def surface_changed(since: str) -> bool | None:
    """Did any served-surface file change between `since` and HEAD?

    None means the question could not be answered -- an unknown commit in a
    shallow clone, or no git at all. The caller reports that as `unknown`.
    """
    rc, _ = _git("cat-file", "-e", since + "^{commit}")
    if rc != 0:
        return None
    rc, out = _git("diff", "--name-only", f"{since}..HEAD", "--", *SURFACE_PATHS)
    if rc != 0:
        return None
    return bool(out)


def latest_for(check: str, readings: list) -> dict | None:
    """The most recently recorded passing reading that covered `check`."""
    for reading in reversed(readings):
        if check in reading.get("checks", []):
            return reading
    return None


def status(readings: list) -> dict:
    """Per-check verdict: current, stale, unknown, or never."""
    out = {}
    for check in CHECKS:
        reading = latest_for(check, readings)
        if reading is None:
            out[check] = {"verdict": "never", "reading": None}
            continue
        commit = reading.get("commit") or ""
        if commit == head_commit():
            out[check] = {"verdict": "current", "reading": reading}
            continue
        changed = surface_changed(commit)
        if changed is None:
            verdict = "unknown"
        elif changed:
            verdict = "stale"
        else:
            verdict = "current"
        out[check] = {"verdict": verdict, "reading": reading}
    return out


def record(checks, *, result: str, commit: str | None = None, pages: int | None = None,
           scope: str = "full", now: str | None = None) -> dict:
    """Append a reading. Only ever called for a full, unskipped, passing run.

    The caller (`browser_checks.py`) enforces those conditions; they are
    restated in the module docstring because they are the whole reason this
    file can be trusted.
    """
    reading = {
        "measured": now or dt.date.today().isoformat(),
        "commit": commit or head_commit() or "",
        "checks": sorted(checks),
        "result": result,
        "scope": scope,
    }
    if pages is not None:
        reading["pages"] = pages
    data = load()
    data.setdefault("readings", []).append(reading)
    # Keep the file short: the trend is not the signal here, the latest
    # reading per check is. Twenty is plenty to see a pattern of re-runs.
    data["readings"] = data["readings"][-20:]
    with open(STATE, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return reading


_MARK = {"current": "ok  ", "stale": "STALE", "unknown": "?   ", "never": "NEVER"}


def report(st: dict) -> str:
    lines = ["Browser checks — when each last passed over the whole catalogue", ""]
    for check in CHECKS:
        entry = st[check]
        reading = entry["reading"]
        mark = _MARK[entry["verdict"]]
        if reading is None:
            lines.append(f"  {mark}  {check:<10} no reading has ever been recorded")
            continue
        when = reading.get("measured", "?")
        commit = (reading.get("commit") or "")[:8]
        pages = reading.get("pages")
        extra = f", {pages} pages" if pages else ""
        lines.append(f"  {mark}  {check:<10} {when} at {commit}{extra}")
    stale = [c for c in CHECKS if st[c]["verdict"] in ("stale", "never", "unknown")]
    lines.append("")
    if not stale:
        lines.append("  Every check has a reading that still covers the current tree.")
    else:
        lines.append(f"  {len(stale)} check(s) need a run: {', '.join(stale)}")
        lines.append("")
        lines.append("    npm install --no-save playwright@1.56.0 axe-core")
        lines.append(f"    python3 platform/ci/browser_checks.py --record "
                     f"--checks {','.join(stale)}")
        lines.append("")
        lines.append("  A `--only <slug>` run is not recorded: it verifies less, and")
        lines.append("  browser_checks.py stamps it FILTERED for that reason.")
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="machine-readable verdicts")
    ap.add_argument("--require-current", action="store_true",
                    help="exit 1 unless every check has a reading covering HEAD")
    args = ap.parse_args(argv)

    st = status(load().get("readings", []))
    if args.json:
        print(json.dumps({c: {"verdict": st[c]["verdict"], "reading": st[c]["reading"]}
                          for c in CHECKS}, indent=2, sort_keys=True))
    else:
        print(report(st))

    if args.require_current:
        stale = [c for c in CHECKS if st[c]["verdict"] != "current"]
        if stale:
            print(f"\nrequire-current: {len(stale)} check(s) without a current "
                  f"reading: {', '.join(stale)}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
