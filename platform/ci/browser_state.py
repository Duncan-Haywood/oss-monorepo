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

Staleness is computed with `git diff --name-only`, so a clone that cannot
reach the recorded commit reports `unknown` rather than guessing -- never
`current`, which is the direction the 2026-08-30..09-04 "nothing is served"
episode failed in.

## What a reading is anchored to, and why it is not just the commit

**Added 2026-09-09, because anchoring on the commit alone was quietly
self-defeating.** A reading records the commit its run was taken at, which
for the PR that carries the reading is a *branch* commit -- and this
repository squash-merges, so that sha ceases to exist the moment the PR
lands. `0c9b33fc` was recorded for `highlight` and `journey` by PR #4344;
the squash landed as `ca713361`; the branch commit is unreachable in a
**complete** clone, not merely a shallow one. Both checks therefore read
`unknown` forever, and the report demanded a 25-minute whole-catalogue
re-run to re-establish a state that had not actually changed.

That is this tool's own failure mode, not an incidental bug: it exists to
stop sessions paying 25 minutes to re-answer a settled question, and the
anchor it chose guaranteed they would, on every PR that ever records a
reading -- which is every reading this repository takes.

So a reading also records the **tree object id of each served-surface
path**. A tree oid is content-addressed, so identical content has an
identical oid regardless of which commit carries it, and a squash-merge
preserves the tree it squashes. The oids are therefore the same on both
sides of the merge that destroys the sha. The commit is kept because it is
what a human reads in the report; the oids are what the verdict falls back
to when the commit is gone, and they answer the question the reading was
always really about -- did the served surface change? -- rather than the
proxy question of whether one particular commit is still reachable.

Three properties this deliberately keeps:

  - **A reading with no anchor stays `unknown`.** The readings recorded
    before this change carry no `surface` key, and absence must not launder
    into a pass. Only a recorded anchor that *matches* yields `current`.
  - **An unanswerable tree diff is `unknown` too.** If the recorded tree
    object is genuinely absent -- a reading taken on a branch whose venture
    content never landed anywhere -- that is not "nothing moved".
  - **The report names the remedy that can work.** `_unknown_reason`
    distinguishes a shallow clone (where `git fetch --unshallow` is the
    fix) from a complete one (where it is not), the same discrimination
    `platform/webcheck/history-blob.mjs` makes for the same reason. The
    single "shallow clone?" string it replaced sent the reader at a command
    that cannot bring back a commit no history contains -- measured the
    same day, by unshallowing this repository and finding `0c9b33fc`
    exactly as unreachable as before.
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

# The eight checks browser_checks.py knows about. Duplicated as a literal
# rather than imported so that reading the state file never triggers the
# environment probing browser_checks.py does at import time -- and kept honest
# by `test_browser_checks.Registry.test_every_enumeration_of_the_checks_agrees`,
# because a duplicated constant with no guard is how this repository has twice
# shipped a rule that went stale on one side.
CHECKS = ("sideways", "presets", "roundtrip", "highlight", "contrast", "optout", "sweep", "journey")

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


def clone_is_shallow() -> bool:
    """Is this a shallow clone? Decides what an unreachable commit means.

    The same discrimination `platform/webcheck/history-blob.mjs` makes, for
    the same reason: an object missing from a *shallow* clone is a clone
    artefact and `git fetch --unshallow` fixes it, while one missing from a
    *complete* history is a stale pin that unshallowing cannot rescue. Saying
    "shallow clone?" in both cases sends the reader of the second case at a
    command that cannot help.
    """
    rc, out = _git("rev-parse", "--is-shallow-repository")
    return rc == 0 and out.strip() == "true"


def _object_exists(oid: str) -> bool:
    rc, _ = _git("cat-file", "-e", oid)
    return rc == 0


def surface_trees(ref: str = "HEAD") -> dict[str, str] | None:
    """Tree object ids for each served-surface path at `ref`.

    This is the anchor a reading survives on, and it exists because the
    commit sha does not. A reading is recorded on whatever HEAD the session
    was sitting on, which for the PR that carries the reading is a *branch*
    commit -- and this repository squash-merges, so that sha ceases to exist
    the moment the PR lands. `browser_state.json` recorded `0c9b33fc` from
    PR #4344 on 2026-09-09; the squash landed as `ca713361` and the branch
    commit is unreachable even in a complete clone, which left `highlight`
    and `journey` reading `unknown` forever and demanded a 25-minute
    whole-catalogue re-run to clear something that had not actually changed.

    A tree oid is content-addressed, so identical content has an identical
    oid no matter which commit carries it. A squash-merge preserves the tree
    it squashes, so these three oids are the same before and after the merge
    that destroys the sha. That makes the reading answer the question it was
    always really about -- did the served surface change? -- rather than the
    proxy question of whether one particular commit is still reachable.
    """
    trees: dict[str, str] = {}
    for path in SURFACE_PATHS:
        rc, oid = _git("rev-parse", f"{ref}:{path}")
        if rc != 0 or not oid:
            return None
        trees[path] = oid
    return trees


def _shared_changed_trees(recorded: dict, head: dict) -> bool | None:
    """Did the builder, chrome, front door or mirror change, by tree oid?

    None means unanswerable, which the caller reports as `unknown` and never
    as `current` -- the same direction of failure the commit-based helpers
    take.
    """
    for path in SHARED_PATHS:
        before, after = recorded.get(path), head.get(path)
        if not before or not after:
            return None
        if before != after:
            return True
    return False


def shared_files_changed(since: str, limit: int = 6) -> list[str] | None:
    """Which files under SHARED_PATHS moved since `since`, for the report.

    **Why this exists, measured 2026-09-17.** `_shared_changed_trees` answers
    "did the builder move?" as one bit over the whole of `platform/pages` and
    `platform/marketing`, and a true there invalidates every check over all
    1145 pages -- a ~40-minute sweep. That is right when the builder's
    *rendering* changed, and it is the common case for the wrong reason: the
    per-venture registration data lives in those same trees. Counted over
    2026-09-17, the files moving them were `clauses.mjs` 27 times,
    `launched.json` 19 and `build.mjs` 18 -- essentially once per venture
    merge, because shipping a venture appends its row.

    So eleven full-catalogue sweeps were recorded that day, every one `pass`,
    each invalidated within an hour or two by the next venture landing. At
    roughly 40 minutes each that is over seven hours of fleet capacity spent
    re-proving a result that had not changed, and it is capacity the mandate
    wants spent on products.

    This does **not** narrow the invalidation, and deliberately so: a change
    to `clauses.mjs` really can alter the disclaimer every page carries, and
    telling the difference between that and appending one slug to an exemption
    list needs to read the diff's *meaning*, not its path. Getting that wrong
    would let a real accessibility regression go unswept, which is the one
    failure this check exists to prevent. Narrowing it is an owner-facing
    design question, recorded in the ledger rather than decided here.

    What it does is name the files, so a session reading `STALE` can see
    whether the builder actually changed or whether one venture registered
    itself, and spend its forty minutes knowingly. Returns None when the
    question is unanswerable -- never an empty list, which would read as
    "nothing moved".
    """
    code, out = _git("diff", "--name-only", f"{since}..HEAD", "--", *SHARED_PATHS)
    if code != 0:
        return None
    names = [line.strip() for line in out.splitlines() if line.strip()]
    return names[:limit]


def _changed_slugs_trees(recorded: dict, head: dict) -> set[str] | None:
    """Venture slugs whose own files changed, by tree oid.

    `git diff` accepts two tree objects directly, so this needs no commit at
    either end. Paths come out relative to the `ventures/` tree, so the slug
    is the first segment rather than the second.
    """
    before, after = recorded.get(VENTURE_ROOT), head.get(VENTURE_ROOT)
    if not before or not after:
        return None
    if before == after:
        return set()
    # The recorded tree can be genuinely absent -- a reading taken on a branch
    # whose venture content never landed. Unanswerable, not "nothing moved".
    if not _object_exists(before):
        return None
    rc, out = _git("diff", "--name-only", before, after)
    if rc != 0:
        return None
    slugs = set()
    for line in out.splitlines():
        parts = line.split("/")
        if len(parts) >= 2 and parts[0]:
            slugs.add(parts[0])
    return slugs


def _drift_since(reading: dict) -> tuple[bool | None, set[str] | None]:
    """(shared_changed, moved_slugs) for a reading, by whichever anchor works.

    The recorded commit is tried first, because every reading carries one and
    the commit path is what the existing tests pin. The recorded surface tree
    oids are the fallback, and they are what survives a squash-merge. Either
    way an unanswerable question stays `None` and reports as `unknown`.
    """
    commit = reading.get("commit") or ""
    if commit:
        shared = shared_changed(commit)
        if shared is not None:
            if shared:
                return True, set()
            moved = changed_slugs(commit)
            if moved is not None:
                return False, moved
    recorded = reading.get("surface")
    if isinstance(recorded, dict) and recorded:
        head = surface_trees()
        if head:
            shared = _shared_changed_trees(recorded, head)
            if shared is not None:
                if shared:
                    return True, set()
                moved = _changed_slugs_trees(recorded, head)
                if moved is not None:
                    return False, moved
    return None, None


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


def _unknown_reason(reading: dict | None) -> str:
    """Why a reading could not be compared to HEAD, said accurately.

    This used to be the single string "recorded commit unreachable (shallow
    clone?)" for every `unknown`. On a complete clone that is a
    misdiagnosis, and an expensive one: it sends the reader at `git fetch
    --unshallow`, which cannot bring back a commit that no longer exists in
    any history. Measured 2026-09-09, when unshallowing this repository left
    `0c9b33fc` exactly as unreachable as before.
    """
    if reading is None:
        return "no reading"
    commit = (reading.get("commit") or "")[:8]
    if clone_is_shallow():
        return f"{commit} is outside this shallow clone (git fetch --unshallow)"
    if reading.get("surface"):
        # It carried the durable anchor and still could not be compared, so
        # the venture content itself never landed in any reachable history.
        return f"{commit} and its recorded surface are absent from this history"
    return (f"{commit} is absent from the complete history -- recorded on a "
            f"branch that was squash-merged, and predates the surface anchor")


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
        if commit and commit == head:
            out[check] = {"verdict": "current", "reading": reading, "pending": []}
            continue

        shared, moved = _drift_since(reading)
        if shared is None:
            out[check] = {"verdict": "unknown", "reading": reading, "pending": []}
            continue
        if shared:
            # The builder or the front door moved: every page renders
            # differently, so nothing cheaper than a full re-run will do.
            out[check] = {"verdict": "stale", "reading": reading, "pending": []}
            continue

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
    # The durable half of the anchor. The commit above is kept because it is
    # what a human reads in the report, but it is the half that dies on a
    # squash-merge; these three tree oids are what the verdict falls back to.
    # Recorded only when git can answer -- a reading with no `surface` key
    # behaves exactly as it did before, which is what keeps the existing
    # readings in `browser_state.json` valid.
    #
    # Asked at the RECORDED commit, not at HEAD. `surface_trees()` defaults to
    # HEAD, and HEAD is not the commit this reading is about whenever a sibling
    # session merged during the run -- which is the ordinary case here
    # (`session_gate.py` measures up to 4 distinct sessions inside a 15-minute
    # window) and the exact case `browser_checks._record_reading` already
    # prints "HEAD moved during this run" for. Taking the commit from the build
    # and the trees from HEAD produced a reading whose two halves described
    # different trees, and the tree half is the one the verdict falls back to
    # once the sha dies -- so the durable anchor was the wrong one, on exactly
    # the runs where the other anchor was least reliable. Measured 2026-09-09:
    # a whole-catalogue sweep built at `a979dedb` finished four merges later at
    # `b3776090`, which had gained `ventures/actions-permissions-check/
    # vs-openssf-scorecard.html` -- a page no browser in that run ever opened,
    # and which the reading would have reported as covered.
    #
    # An unreachable commit still yields no `surface` key rather than a
    # substitute: absence reads as unknown, never as health.
    trees = surface_trees(reading["commit"] or "HEAD")
    if trees:
        reading["surface"] = trees
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
        # No count on the row, deliberately. `reading["pages"]` is
        # `browser_checks.py::_count_html` -- the HTML file count of the built
        # artifact, which that function's own docstring calls "only ever
        # context" and does not derive from any check's scope. The checks
        # cover different sets: `contrast.mjs` filters out every `404.html`
        # and `offline.html`, so its axe total is always below the file count.
        #
        # Printing it beside a check's name attributes it to that check,
        # whatever noun follows. It did: #4651's ledger recorded "all 7 checks
        # passing over 1022 pages ... with no WCAG A/AA violations" when
        # contrast had covered 1020. Renaming it to "files" was the first
        # attempt and was not enough -- `contrast ... 1022 files` still reads
        # as contrast's number. The count is artifact-wide, so it belongs on
        # one line about the artifact, below.
        lines.append(f"  {mark}  {check:<10} {when} at {commit}")
    # The artifact count, once, labelled as what it is. Grouped by commit
    # rather than assumed common: a `--only` run records a scoped reading, so
    # two checks can legitimately carry different counts, and collapsing that
    # into one number would be the same overstatement one level up.
    by_count = {}
    for check in CHECKS:
        reading = st[check]["reading"]
        if not reading or not reading.get("pages"):
            continue
        key = (reading.get("pages"), (reading.get("commit") or "")[:8])
        by_count.setdefault(key, []).append(check)
    if by_count:
        lines.append("")
        for (pages, commit), checks in sorted(by_count.items()):
            who = "" if len(checks) == len(CHECKS) else f" ({', '.join(checks)})"
            lines.append(
                f"  artifact at {commit}: {pages} HTML files{who} — context, not"
                " any check's coverage; each check scopes its own set"
            )

    stale = [c for c in CHECKS if st[c]["verdict"] in ("stale", "never", "unknown")]
    lines.append("")
    if not stale:
        lines.append("  Every check has a reading that still covers the current tree.")
        return "\n".join(lines)

    lines.append(f"  {len(stale)} check(s) need a run: {', '.join(stale)}")
    lines.append("")
    lines.append("    npm install --no-save playwright@1.63.0 axe-core")

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
                why.append(f"{c}: {_unknown_reason(st[c]['reading'])}")
            elif c in WHOLE_SITE_CHECKS:
                why.append(f"{c}: whole-site narrative, ignores --only")
            else:
                why.append(f"{c}: the builder or front door changed")
        lines.append("  Needs the whole catalogue — " + "; ".join(why) + ".")
        # Name the files behind "the builder changed". They are usually the
        # per-venture registration rows rather than rendering logic, and a
        # session that cannot see which is which re-runs 40 minutes blind.
        # See shared_files_changed's docstring for the measurement.
        anchors = [
            st[c]["reading"].get("commit")
            for c in full
            if st[c].get("reading") and st[c]["reading"].get("commit")
        ]
        if anchors:
            moved = shared_files_changed(anchors[0])
            if moved:
                lines.append("    builder files that moved: " + ", ".join(moved))
                lines.append(
                    "    a row appended per venture (clauses.mjs, launched.json) invalidates"
                )
                lines.append(
                    "    all 1145 pages the same as a rendering change would — check which"
                )
                lines.append(
                    "    this is before spending the full run."
                )
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
