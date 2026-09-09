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

## Staleness is per-venture, and the reason is that the flat version ate itself

Until 2026-09-07 the paragraph above was implemented as one boolean over the
whole tree: *any* file under those three roots changed, so *every* check went
stale over *every* page. That is correct in the strict direction and it made
the tool unusable, which is the same failure as being wrong in the lax one.

Measured that day, and this is the whole argument. Two separate sessions each
ran the full 20-30 minute sweep and recorded it clean -- #3782 at 14:02Z and
#3780 at 14:06Z, 7/7 checks over 804 pages. Both readings were reported STALE
over the entire catalogue within the half hour.

Classifying the last 60 commits on `main` by what they actually touched says
how often that is avoidable, and the split is close to even:

    22/60   changed platform/pages/** or platform/marketing/**
            -- the builder, chrome, front door or mirror. Every page renders
               differently. A full re-run is genuinely required, and this
               change does not pretend otherwise.
    27/60   changed only ventures/**
            -- and every one of those 27 touched either ONE venture or TWO.
               Never more. Under the flat rule each of them threw away a
               30-minute reading over 806 pages to re-verify at most two.
    11/60   touched no served surface at all (docs, ledger, CI tooling)
            -- already free under the old rule, and still are.

So on 45% of merges the guard was discarding a whole catalogue's worth of
verification to account for one or two products. That is a treadmill, not a
guard: it puts a session back on the choice this file exists to remove
(spend 30 minutes, or skip) on the very merges the repository does most --
and CLAUDE.md records at length which of those two sessions pick.

So staleness now asks the narrower question the paths themselves already
answer:

  - `platform/pages/**` and `platform/marketing/**` are the builder, the
    chrome and the front door. They render *every* page, so a change there
    voids every reading, full and scoped alike. No cheap run can rescue it.
  - `ventures/<slug>/**` changes only that venture's pages. It voids the
    reading for `<slug>` and for nothing else.

A check is `current` when its newest full reading is shared-clean and every
venture that has changed since has been re-covered by a later scoped run.
`browser_checks.py --only <slug>` takes about a minute per venture, and the
measurement above says the post-merge case is one or two ventures, so the
ordinary cost is a minute or two rather than 25 -- and the catalogue keeps a
reading that is true rather than one nobody refreshes.

Note what this does **not** buy, because the coarse half is deliberate.
`SHARED_PATHS` is every file under those two roots, data files included
(`launched.json`, `siblings-budget.json`), not just the builder source. Some
of those probably could not change what a browser sees on most pages, but
deciding which is a heuristic about a rendering pipeline, and the cost of
being wrong there is a defect shipped unseen. The strict direction stays
strict; the win comes entirely from the venture half.

**The honesty rule is unchanged, and it is what makes this safe.** A scoped
reading is written as `scope: "ventures"` with the slugs it covered, and can
only ever *top up* a full one -- it can never substitute for a full reading,
so `never` never becomes `current` by way of a filtered run. And `journey` is
a whole-site narrative that ignores `--only` (see `browser_checks.py`), so no
scoped reading is ever recorded as covering it: any venture change still
makes `journey` stale over the whole catalogue, exactly as before.

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

# The half of SURFACE_PATHS that renders every page: the builder, the page
# chrome, the front door and the mirror. A change here voids every reading,
# because no per-venture run can establish that the other 174 still render.
SHARED_PATHS = ("platform/pages", "platform/marketing")

# The half that is per-product. A change under `ventures/<slug>/` voids the
# reading for `<slug>` alone.
VENTURE_ROOT = "ventures"

# Checks that ignore `--only` because they are whole-site narratives rather
# than per-page assertions (`browser_checks.py` says so in its own --only
# help). A scoped run cannot cover these, so they are never recorded as
# scoped and any venture change leaves them stale.
WHOLE_SITE_CHECKS = ("journey",)


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


def shared_changed(since: str) -> bool | None:
    """Did the builder, chrome, front door or mirror change since `since`?

    None means unanswerable (unknown commit in a shallow clone, or no git),
    which the caller reports as `unknown` and never as `current`.
    """
    rc, _ = _git("cat-file", "-e", since + "^{commit}")
    if rc != 0:
        return None
    rc, out = _git("diff", "--name-only", f"{since}..HEAD", "--", *SHARED_PATHS)
    if rc != 0:
        return None
    return bool(out)


def changed_slugs(since: str) -> set | None:
    """Venture slugs whose own files changed between `since` and HEAD.

    `None` on the same unanswerable cases as `shared_changed`. An empty set
    means no venture moved, which is a real answer and not an absent one.
    """
    rc, _ = _git("cat-file", "-e", since + "^{commit}")
    if rc != 0:
        return None
    rc, out = _git("diff", "--name-only", f"{since}..HEAD", "--", VENTURE_ROOT)
    if rc != 0:
        return None
    slugs = set()
    for line in out.splitlines():
        parts = line.strip().split("/")
        # `ventures/<slug>/...` — anything shallower is not a venture's own
        # file and is ignored rather than guessed at.
        if len(parts) >= 3 and parts[0] == VENTURE_ROOT and parts[1]:
            slugs.add(parts[1])
    return slugs


def latest_for(check: str, readings: list) -> dict | None:
    """The most recently recorded passing reading that covered `check`."""
    for reading in reversed(readings):
        if check in reading.get("checks", []):
            return reading
    return None


def latest_full_for(check: str, readings: list) -> dict | None:
    """The most recent *full-catalogue* reading that covered `check`.

    Scoped readings are deliberately not eligible here. A run over one
    venture says nothing about the other 174, so letting one stand as the
    base reading would let `never` become `current` by way of a filtered
    run — the exact laundering this file's refusals exist to prevent.
    """
    for reading in reversed(readings):
        if reading.get("scope", "full") != "full":
            continue
        if check in reading.get("checks", []):
            return reading
    return None


def _covered_since(check: str, slug: str, readings: list, after_commit: str) -> bool:
    """Has `slug` been re-verified for `check` since the base reading?

    True only when some scoped reading recorded *after* the base covers this
    check and this slug, and the venture has not changed again since that
    scoped reading was taken.
    """
    seen_base = False
    for reading in readings:
        if not seen_base:
            if reading.get("commit") == after_commit:
                seen_base = True
            continue
        if check not in reading.get("checks", []):
            continue
        if slug not in reading.get("slugs", []):
            continue
        commit = reading.get("commit") or ""
        if commit == head_commit():
            return True
        moved = changed_slugs(commit)
        if moved is not None and slug not in moved:
            return True
    return False


def status(readings: list) -> dict:
    """Per-check verdict: current, stale, unknown, or never.

    Stale entries carry `pending`: the venture slugs that need re-running,
    which is what turns a stale verdict into a one-minute command instead of
    a 25-minute one. `pending` is empty when the staleness is shared — a
    builder or front-door change that no scoped run can rescue.
    """
    out = {}
    head = head_commit()
    for check in CHECKS:
        reading = latest_full_for(check, readings)
        if reading is None:
            out[check] = {"verdict": "never", "reading": None, "pending": []}
            continue
        commit = reading.get("commit") or ""
        if commit == head:
            out[check] = {"verdict": "current", "reading": reading, "pending": []}
            continue

        shared = shared_changed(commit)
        if shared is None:
            out[check] = {"verdict": "unknown", "reading": reading, "pending": []}
            continue
        if shared:
            # The builder or the front door moved: every page renders
            # differently, so nothing cheaper than a full re-run will do.
            out[check] = {"verdict": "stale", "reading": reading, "pending": []}
            continue

        moved = changed_slugs(commit)
        if moved is None:
            out[check] = {"verdict": "unknown", "reading": reading, "pending": []}
            continue
        if not moved:
            out[check] = {"verdict": "current", "reading": reading, "pending": []}
            continue
        if check in WHOLE_SITE_CHECKS:
            # `journey` ignores --only, so no scoped reading ever covers it.
            out[check] = {"verdict": "stale", "reading": reading,
                          "pending": sorted(moved)}
            continue

        pending = sorted(s for s in moved
                         if not _covered_since(check, s, readings, commit))
        out[check] = {
            "verdict": "current" if not pending else "stale",
            "reading": reading,
            "pending": pending,
        }
    return out


def record(checks, *, result: str, commit: str | None = None, pages: int | None = None,
           scope: str = "full", slugs=None, now: str | None = None) -> dict:
    """Append a reading for an unskipped, passing run.

    `scope="full"` is a whole-catalogue run and is the only kind that can
    establish coverage for a check. `scope="ventures"` carries `slugs` and
    can only top up an existing full reading for the ventures it names —
    see `latest_full_for`. The caller (`browser_checks.py`) enforces the
    unskipped/passing conditions; they are restated in the module docstring
    because they are the whole reason this file can be trusted.
    """
    reading = {
        "measured": now or dt.date.today().isoformat(),
        "commit": commit or head_commit() or "",
        "checks": sorted(checks),
        "result": result,
        "scope": scope,
    }
    if slugs:
        reading["slugs"] = sorted(slugs)
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


# Padded to a common width so the check names line up in the report; the
# summary marks in browser_checks.py are padded for the same reason.
_MARK = {"current": "ok   ", "stale": "STALE", "unknown": "?    ", "never": "NEVER"}


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
        return "\n".join(lines)

    lines.append(f"  {len(stale)} check(s) need a run: {', '.join(stale)}")
    lines.append("")
    lines.append("    npm install --no-save playwright@1.56.0 axe-core")

    # A stale check whose `pending` names ventures can be repaired by a
    # per-venture run (about a minute each) instead of the whole catalogue.
    # A check stale for any other reason -- never run, unknown commit, or a
    # builder/front-door change -- needs the full run, so the two are never
    # merged into one suggestion.
    scoped = {c: st[c]["pending"] for c in stale
              if st[c]["verdict"] == "stale" and st[c]["pending"]
              and c not in WHOLE_SITE_CHECKS}
    full = [c for c in stale if c not in scoped]

    if scoped:
        slugs = sorted({s for pend in scoped.values() for s in pend})
        lines.append(f"    python3 platform/ci/browser_checks.py --record "
                     f"--checks {','.join(sorted(scoped))} --only {','.join(slugs)}")
    if full:
        lines.append(f"    python3 platform/ci/browser_checks.py --record "
                     f"--checks {','.join(full)}")
    lines.append("")
    if scoped:
        lines.append(f"  {len(slugs)} venture(s) changed since the last full reading: "
                     f"{', '.join(slugs)}")
        lines.append("  A `--only` run over those is recorded as a scoped reading and")
        lines.append("  tops the full one up. It can never stand in for a full run.")
        # Measured 2026-09-09: the scoped command above is built from which
        # ventures MOVED, never from which of them a given check has anything
        # to say about. `ada-title-ii-evidence` moved and does not print the
        # sentence `highlight` verifies, so the suggested command exited 2 with
        # "nothing to verify" and correctly declined to record -- leaving the
        # check exactly as stale and the run spent.
        #
        # The scope predicate lives in the checks themselves (`highlight.mjs`
        # reads HIGHLIGHT_PROMISE from `invalid.mjs`), and restating a JS rule
        # in Python here is the mistake CLAUDE.md records twice as having cost
        # live product. So this says what the outcome means instead of
        # predicting it -- the check reports its own scope, which is the only
        # copy of that rule.
        lines.append("  If it exits 2 with \"nothing to verify\", that venture is")
        lines.append("  out of scope for that check -- not an error. Clear it with the")
        lines.append("  full run instead:")
        lines.append(f"    python3 platform/ci/browser_checks.py --record "
                     f"--checks {','.join(sorted(scoped))}")
    if full:
        why = []
        for c in full:
            v = st[c]["verdict"]
            if v == "never":
                why.append(f"{c}: never recorded")
            elif v == "unknown":
                why.append(f"{c}: recorded commit unreachable (shallow clone?)")
            elif c in WHOLE_SITE_CHECKS:
                why.append(f"{c}: whole-site narrative, ignores --only")
            else:
                why.append(f"{c}: the builder or front door changed")
        lines.append("  Needs the whole catalogue — " + "; ".join(why) + ".")
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
        print(json.dumps({c: {"verdict": st[c]["verdict"], "reading": st[c]["reading"],
                              "pending": st[c]["pending"]}
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
