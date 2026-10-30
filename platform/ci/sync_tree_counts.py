#!/usr/bin/env python3
"""Recompute the hand-written counts that describe the size of the tree.

One number in this repository is a *derived fact written down by hand*: the
**opt-out switch count**, `SWITCHES_IN_THE_CATALOGUE` in
`platform/privacy/optout-persistence.test.mjs`. (Until 2026-10-30 a second
one, the apex mirror's tool count, lived in seven places under `infra/` and
`gitops/`; it left with those trees.)

It already has a guard that fails when the number drifts, and the guard
works. What it did not do was *fix* anything: the failure named the right
number and left the next session to hand-edit it. (The retired
`gitops/ci/sync_readme_counts.py` recorded two whole pull requests spent in one
afternoon retyping three integers.)

**The same tax is now measurable here, and it is worse, because it is paid by
a session that did nothing wrong.** Measured 2026-09-16/17:

  - #4853's branch was open before #4859 landed. Each raised
    `SWITCHES_IN_THE_CATALOGUE` by one against a base where the other had not,
    so the pair of graduations moved it once and `main` went red the moment
    the second merged.
  - `platform/privacy/optout-persistence.test.mjs` already records a third
    instance (the bridal-hair-makeup / #4766 pair) from the day before.

Three instances in two days is not three careless authors. With several
sessions merging inside one fifteen-minute window -- `session_gate.py`
measures up to 4 -- any constant that counts the *tree* will be written by two
branches at once, and both will be right about the base they could see. The
arithmetic cannot be done correctly on a branch; it can only be done on the
merge result. So this script exists to be run *at* the merge, where the answer
is knowable.

It matters more than it looks because Actions is starved: CI is not running
these guards, so a wrong count is not caught by the machine that exists to
catch it. It is caught by a session happening to look, which is how all three
instances above were found.

## What it does not do, deliberately

It rewrites **numbers only**. It never writes the running-comment entry that
explains *why* a count moved, and it will not let you think it did: on a fix
it prints the entry you still owe.

That restraint is the point rather than laziness. Those running comments are
the most valuable thing in the file -- they are how the third instance of
this collision was recognised as the third rather than as a puzzle -- and a
tool that appended "+1, reason unknown" on every bump would quietly turn a
record of *why the tree changed shape* into a changelog of its own writes. The
number is a fact this script can derive. The reason is a judgement only the
author has.

## Deriving, not restating

The opt-out count is read by calling `checkAll` from
`platform/privacy/optout-persistence.mjs` through Node -- the *same*
derivation the guard itself uses, never a second copy of it. That
is deliberate and it is this repository's most-repeated lesson: `CLAUDE.md`
records restating a rule that lives in `build.mjs` costing live product twice.
A sync tool that re-implemented the scan could drift from the guard it is meant to satisfy, and then the
two would disagree with nothing to say which was right.

Usage:

    python3 platform/ci/sync_tree_counts.py            # fix in place
    python3 platform/ci/sync_tree_counts.py --check     # report, exit 1 on drift

Exit codes: 0 nothing to do (or fixed, without `--check`), 1 drift found under
`--check` or a file could not be rewritten, 2 a count could not be derived at
all -- which is never reported as "in sync", so "no reading taken"
never reads as a pass.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


class DerivationError(RuntimeError):
    """A count could not be derived. Never the same as a count of zero."""


# --------------------------------------------------------------------------
# Deriving the count through the guard's own code
# --------------------------------------------------------------------------


def optout_switch_count() -> int:
    """Venture usage modules that offer a working in-page opt-out.

    Calls `checkAll` from `platform/privacy/optout-persistence.mjs` -- the
    behavioural check itself, which drives each module rather than reading its
    source. A static scan here would disagree with the guard on exactly the
    modules the guard was written to catch.
    """
    module = REPO / "platform" / "privacy" / "optout-persistence.mjs"
    if not module.exists():
        raise DerivationError(f"{module} is missing; cannot derive the opt-out switch count")

    # The predicate is `status !== "no-switch"`, copied from the assertion in
    # optout-persistence.test.mjs that pins the number ("switched"), not from
    # the adjacent "pass" count. The two are equal on a green tree and differ
    # on a red one -- if a module's switch breaks, `pass` drops and `switched`
    # does not, and it is `switched` the constant is compared against. Getting
    # this wrong is not theoretical: the first draft of this script filtered
    # on a status string that does not exist, derived 0, and would have
    # rewritten the constant to 0 had it not been run under --check first.
    script = (
        "import { checkAll } from %s;\n"
        "const results = await checkAll(%s);\n"
        "const switched = results.filter((r) => r.status !== 'no-switch');\n"
        "console.log(JSON.stringify({ count: switched.length }));\n"
    ) % (json.dumps(module.as_posix()), json.dumps((REPO / "ventures").as_posix()))

    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    if proc.returncode != 0:
        raise DerivationError(
            "could not run the opt-out check through Node "
            f"(exit {proc.returncode}): {proc.stderr.strip()[:400]}"
        )
    try:
        return int(json.loads(proc.stdout.strip().splitlines()[-1])["count"])
    except Exception as exc:
        raise DerivationError(
            f"unexpected output from the opt-out check: {proc.stdout.strip()[:200]!r}"
        ) from exc


# --------------------------------------------------------------------------
# The places each count is written down
# --------------------------------------------------------------------------


@dataclass
class Site:
    """One hand-written statement of a derived count."""

    path: str
    # A regex whose every capture group is a run of digits to replace. More
    # than one group is the normal case for a sentence naming the count twice
    # ("mirrors N of the N tools"): both are rewritten in a single pass, so
    # the patterns are not order-dependent. An earlier draft used one Site per
    # number, and the first rewrite made the second stop matching -- caught by
    # this script's own tests, which is the argument for having them.
    pattern: str
    what: str
    # How many times the pattern is expected to match. A pattern that stops
    # matching is a rewording, which must be reported rather than silently
    # doing nothing -- the failure mode this whole script exists to remove.
    expected: int = 1
    found: int = field(default=0, init=False)


OPTOUT_SITES = [
    Site(
        "platform/privacy/optout-persistence.test.mjs",
        r"const SWITCHES_IN_THE_CATALOGUE = (\d+);",
        "SWITCHES_IN_THE_CATALOGUE",
    ),
]


def apply(sites: list[Site], value: int, write: bool) -> tuple[list[str], list[str]]:
    """Returns (drifted descriptions, problems)."""
    drifted: list[str] = []
    problems: list[str] = []

    by_file: dict[str, list[Site]] = {}
    for site in sites:
        by_file.setdefault(site.path, []).append(site)

    for rel, group in by_file.items():
        path = REPO / rel
        if not path.exists():
            problems.append(f"{rel}: missing")
            continue
        text = original = path.read_text()

        for site in group:
            matches = list(re.finditer(site.pattern, text))
            site.found = len(matches)
            if not matches:
                problems.append(
                    f"{rel}: the sentence for {site.what!r} no longer matches. "
                    "It was reworded or moved -- fix the pattern in this script rather "
                    "than assuming the count is fine, which is how the number silently "
                    "stopped being checked in the first place."
                )
                continue
            for m in matches:
                for stale in m.groups():
                    if int(stale) != value:
                        drifted.append(f"{rel}: {site.what} says {stale}, tree says {value}")

            def sub(m: re.Match) -> str:
                # Rebuild from the group spans rather than str.replace, so a
                # number that happens to appear elsewhere in the matched text
                # (a year, an issue number) is never touched.
                out, cursor, start = [], 0, m.start()
                for idx in range(1, (m.re.groups or 0) + 1):
                    gs, ge = m.start(idx) - start, m.end(idx) - start
                    out.append(m.group(0)[cursor:gs])
                    out.append(str(value))
                    cursor = ge
                out.append(m.group(0)[cursor:])
                return "".join(out)

            text = re.sub(site.pattern, sub, text)

        if write and text != original:
            path.write_text(text)

    return drifted, problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="report drift and exit 1; write nothing")
    args = ap.parse_args()

    print("Tree counts — numbers written by hand that describe the tree's size\n")

    try:
        switches = optout_switch_count()
    except DerivationError as exc:
        print(f"  COULD NOT DERIVE: {exc}\n")
        print("  Not reporting anything as in sync on a reading that was never taken.")
        return 2

    print(f"  opt-out switches ..... {switches}   (platform/privacy/optout-persistence.mjs::checkAll)\n")

    # A derived zero is never a real reading here: this repository has
    # hundreds of opt-out switches, so zero
    # means the derivation broke, not that the tree emptied. Writing it would
    # turn a broken scan into a committed claim -- which is the same
    # absence-read-as-measurement error `CLAUDE.md` records against the
    # `live_url_visitors` null and the 2026-09-05 Pages reading, except this
    # one would be committed rather than merely believed. The first draft of
    # this script hit exactly that, deriving 0 from a status string that does
    # not exist.
    if switches == 0:
        print("  REFUSING: derived opt-out switches as 0, which is a broken derivation, not a tree state.")
        print("  Nothing written. Fix the derivation before trusting any number here.")
        return 2

    drifted, problems = apply(OPTOUT_SITES, switches, write=not args.check)

    for problem in problems:
        print(f"  PATTERN: {problem}")
    if problems:
        print()

    if not drifted:
        print("  Every hand-written count agrees with the tree.")
        return 1 if problems else 0

    for line in drifted:
        print(f"  DRIFT: {line}")
    print()

    if args.check:
        print("  Run without --check to rewrite them.")
        return 1

    print("  Rewritten.\n")
    print("  Still yours to write, and this script will not do it for you: the")
    print("  running-comment entry in each file saying WHY the count moved -- which")
    print("  venture graduated, or which switch stopped being one. A rise no")
    print("  addition accounts for is not a bump, it is a regression, and the number")
    print("  is then not what needs changing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
