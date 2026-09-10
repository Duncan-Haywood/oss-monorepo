#!/usr/bin/env python3
"""Fail the build if a shared link is layered over the recipient's saved draft.

A calculator with both a "save to this browser" draft and a "copy shareable
link" button restores in a fixed order: read the saved draft from
`localStorage`, then let a link override it. That ordering is right -- a link
should win -- but it only works if the link is applied as a *replacement*.

The defect this catches is the case where it is applied as a *patch*:

    encode   if (value !== null) params.set(id, ...)   a blank is omitted
    decode   if (!params.has(id)) continue             an omitted key is absent
    apply    if (hasOwnProperty.call(values, id))      an absent key is skipped

Each line is reasonable alone. Together they mean a field the sender left
blank never travels, so the box it should have blanked keeps whatever the
draft put there -- the *recipient's* number, presented as the sender's.

Both people then read different figures from the same link and nothing on
screen says so. That is the worst shape a bug can take on a page whose entire
job is agreeing on a number, and it is invisible to everything else: the
arithmetic is correct, the link resolves, the page throws nothing, and every
`calc.mjs` test passes, because the arithmetic was never the problem.

Measured 2026-09-10, and the reason this file exists rather than a third fix:

    poshmark-fee-calculator         listedPrice/offerPrice drive the optional
                                    offer comparison -- a plain sale opened
                                    showing an offer nobody sent
    wash-and-fold-price-calculator  a shop with no minimum charge priced the
                                    sender's scenario against the recipient's

Both shipped within a day of each other, from the same `save-and-share`
pattern being rolled out one venture at a time (#4416, #4423, ...). Two more
ventures had already been fixed individually by then. A rollout that reaches
every calculator is a rollout that will reintroduce this on the next one, so
the guard belongs here rather than in another round of the same repair.

The rule, stated as narrowly as the evidence supports:

  A page that reads a draft from `localStorage` **and** applies a decoded
  shared link must pass that link through a helper that writes *every* field
  the form owns -- so a field the link omitted is cleared, not left standing.

`formValues(decoded)` is the portfolio's name for that helper. What is checked
is the *shape*, not the name: the applied expression must wrap the decoded
value in a call, rather than handing it to the writer bare.

Deliberately out of scope, because flagging either would bury the real thing:

  * A page with a link and no saved draft. Nothing else is in the boxes to be
    mistaken for the sender's numbers, so an omitted field falls back to the
    page's own shipped default -- wrong in a milder way, and a different fix.
  * A page with a draft and no link. There is no second party to disagree with.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# The decoded link being handed straight to the writer -- the defect. Matches
# `writeInputs(fromLink)`, `writeAllInputs(fromLink)`, `writeInput(fromLink)`.
BARE_APPLY = re.compile(r"\bwrite[A-Za-z]*\(\s*fromLink\s*\)")

# The decoded link wrapped in something before it reaches the writer, e.g.
# `writeInputs(formValues(fromLink))`. The wrapper's name is not pinned: what
# matters is that a call stands between the decode and the form.
WRAPPED_APPLY = re.compile(r"\bwrite[A-Za-z]*\(\s*[A-Za-z_$][\w$]*\(\s*fromLink\s*\)\s*\)")

DRAFT = re.compile(r"localStorage\.getItem\(\s*DRAFT_KEY\s*\)")
DECODE = re.compile(r"\bfromLink\s*=\s*decodeInputs\(")


def check_page(markup: str) -> str | None:
    """Return a problem description for one page's markup, or None if sound."""
    if not (DRAFT.search(markup) and DECODE.search(markup)):
        return None  # not both a draft and a link: out of scope, see docstring
    if WRAPPED_APPLY.search(markup):
        return None
    bare = BARE_APPLY.search(markup)
    if bare:
        return (
            f"applies a shared link with `{bare.group(0)}` while a saved draft is "
            "already in the form -- a field the sender left blank is skipped, so the "
            "recipient's own number stays in the box and the two of them read "
            "different figures from the same link. Wrap it: "
            "`write...(formValues(fromLink))`, and have `formValues` return a value "
            "for every field the form owns."
        )
    return None


def check_tree(root: Path) -> list[str]:
    problems: list[str] = []
    for page in sorted(root.rglob("index.html")):
        problem = check_page(page.read_text(encoding="utf-8", errors="replace"))
        if problem:
            problems.append(f"{page}: {problem}")
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path("ventures")
    if not root.exists():
        print(f"{root} does not exist", file=sys.stderr)
        return 2

    problems = check_tree(root)
    if problems:
        print(f"{len(problems)} page(s) layer a shared link over the recipient's draft:\n")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print(f"Every page under {root}/ that has both a saved draft and a shared link replaces the form rather than patching it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
