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

**Widened 2026-09-10, the same day, after the first version of this guard
went quiet on exactly the rollout it was written for.** Four more ventures
(`vending-machine-route-margin`, `dog-walking-route-pricing`,
`reverb-fee-calculator`, `whatnot-seller-payout`) carried the identical
defect through a third idiom the original patterns did not cover:

    const restored = { ...saved, ...fromLink };
    applyVisitInputs(restored);

No `write.../apply...` call is ever made on `fromLink` itself -- it is spread
into a plain object first -- so the original `BARE_APPLY` pattern could not
see it. Two of the four also used a storage-key variable named `INPUTS_KEY`
or `STORAGE_KEY` rather than `DRAFT_KEY`, which the original scope check did
not recognise either, independent of the apply-shape miss. `SPREAD_MERGE`
below catches the object-literal shape, and the scope check now accepts any
`localStorage.getItem(<identifier>)` call rather than one specific name.

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
# `writeInputs(fromLink)`, `writeAllInputs(fromLink)`, `writeInput(fromLink)`,
# and the `apply`-prefixed names several ventures use instead
# (`applyInputs(fromLink)`, `applyVisitInputs(fromLink)`).
BARE_APPLY = re.compile(r"\b(?:write|apply)[A-Za-z]*\(\s*fromLink\s*\)")

# The decoded link wrapped in something before it reaches the writer, e.g.
# `writeInputs(formValues(fromLink))`. The wrapper's name is not pinned: what
# matters is that a call stands between the decode and the form.
WRAPPED_APPLY = re.compile(r"\b(?:write|apply)[A-Za-z]*\(\s*[A-Za-z_$][\w$]*\(\s*fromLink\s*\)\s*\)")

# The decoded link merged into an object literal alongside another variable --
# typically the saved draft -- e.g. `{ ...saved, ...fromLink }` or
# `{ ...DEFAULTS, ...saved, ...fromLink }`. This is the same defect in a
# different idiom, and it is the one that slipped past this checker until
# 2026-09-10: it never calls a `write.../apply...` function on `fromLink` at
# all, so BARE_APPLY cannot see it. Spread order makes fromLink's own keys
# win, which looks like "the link wins" and is not -- a key fromLink omits
# still takes the earlier spread's value (the recipient's own saved draft or
# the calculator's own defaults) instead of being cleared. Measured
# 2026-09-10 in four ventures that had all separately reinvented this same
# merge (`vending-machine-route-margin`, `dog-walking-route-pricing`,
# `reverb-fee-calculator`, `whatnot-seller-payout`) -- none used a
# `write.../apply...` call on the merged result that BARE_APPLY's own scope
# would have caught, and two used a storage-key variable name other than
# `DRAFT_KEY` that the old DRAFT pattern below did not recognise either.
SPREAD_MERGE = re.compile(r"\.\.\.\s*[A-Za-z_$][\w$]*\s*,\s*\.\.\.\s*fromLink\b")

# Any saved-state variable, not only one named `DRAFT_KEY` -- ventures also
# spell this `INPUTS_KEY` and `STORAGE_KEY`. The check below still requires a
# *decoded link* too, so broadening this cannot turn an ordinary page that
# merely uses localStorage for something unrelated into a false positive.
DRAFT = re.compile(r"localStorage\.getItem\(\s*[A-Za-z_$][\w$]*\s*\)")
DECODE = re.compile(r"\bfromLink\s*=\s*decodeInputs\(")

# The one shape that makes a bare `apply(fromLink)` safe rather than the
# defect: an `if (Object.keys(fromLink).length) <bare apply> else <read the
# draft>` branch, where the draft is read *only* when there is no link, so
# the two paths never combine and nothing from the draft can leak into a
# field the link omitted. `etsy-profit-calculator`, `faire-wholesale-calculator`
# and `retainage-cashflow-calculator` (measured 2026-09-10, the same day the
# `apply` prefix was added to BARE_APPLY above) all restore this way, and
# broadening that prefix made this checker flag all three -- correct code,
# false alarm. The earlier, genuinely buggy ventures this file was written
# against (poshmark-fee-calculator, wash-and-fold-price-calculator,
# vending-machine-route-margin, ...) all restore the *other* way: the draft
# loads unconditionally, then the link is layered on top of it regardless,
# which is what actually lets a field the link omitted keep the draft's
# value. The `else` here is load-bearing: without it, this pattern would
# exempt the buggy shape too, since an `if` alone says nothing about what
# else ran before it.
GUARDED_BARE_APPLY = re.compile(
    r"if\s*\(\s*Object\.keys\(\s*fromLink\s*\)\.length\s*\)\s*\{?\s*"
    r"(?:write|apply)[A-Za-z]*\(\s*fromLink\s*\)\s*;?\s*\}?\s*else\b",
    re.DOTALL,
)


def _is_guarded(markup: str, match: re.Match[str]) -> bool:
    """Is this BARE_APPLY match inside the safe if/(bare apply)/else shape?"""
    return any(
        guarded.start() <= match.start() < guarded.end()
        for guarded in GUARDED_BARE_APPLY.finditer(markup)
    )


def check_page(markup: str) -> str | None:
    """Return a problem description for one page's markup, or None if sound."""
    if not (DRAFT.search(markup) and DECODE.search(markup)):
        return None  # not both a draft and a link: out of scope, see docstring

    # Checked ahead of WRAPPED_APPLY's early-accept: a page can carry both a
    # correct `write...(formValues(fromLink))` call *and* a leftover buggy
    # spread elsewhere (e.g. a second restore path), and the spread is
    # unambiguous evidence of the defect either way.
    spread = SPREAD_MERGE.search(markup)
    if spread:
        return (
            f"merges a shared link with `{spread.group(0)}` while a saved draft is "
            "already in the form -- a field the sender left blank keeps the "
            "earlier spread's value (the recipient's own saved draft, or a "
            "default) instead of being cleared, so the two of them read "
            "different figures from the same link. Apply the link separately: "
            "`write...(formValues(fromLink))`, and have `formValues` return a "
            "value for every field the form owns."
        )

    if WRAPPED_APPLY.search(markup):
        return None

    for bare in BARE_APPLY.finditer(markup):
        if _is_guarded(markup, bare):
            continue  # the safe if/(bare apply)/else shape -- see GUARDED_BARE_APPLY
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
