#!/usr/bin/env python3
"""Fail the build if an input accepts a value its own calculator throws on.

`check_form_defaults.py` is the other half of this: it asks whether the values
a page *ships with* satisfy the constraints the page declares. This asks the
opposite question -- whether the constraints a page declares are wide enough to
let a visitor type something the calculator will refuse.

Why that matters here, specifically
-----------------------------------
These tools answer a rejected number with a sentence and an instruction:

    Early-pay discount must be at least 0 and below 100
    fix the highlighted input

`platform/pages/invalid.mjs` is what keeps the second line honest. It finds the
field to mark by asking each control `checkValidity()`, so a field the page
never constrained reports *valid* no matter what is typed into it. When the
only thing that knows the bound is `calc.mjs`, the sentence appears, the
results panel blanks to em-dashes, and nothing is highlighted -- on forms
carrying twenty to forty numeric inputs, usually with the offending one
scrolled off a phone screen.

That is not hypothetical. On 2026-08-31, 21 inputs across four ventures
declared no upper bound at all while their calculators threw above one:

    invoice-payment-terms-calculator  earlyPayDiscountPct  throws at >= 100
    invoice-payment-terms-calculator  annualCarryRate      throws at >= 1000
    faire-wholesale-calculator        openingDiscountRate  throws at >= 100
    ebay-fee-calculator               returnRatePercent    throws at >  100

and two declared `min="0"` against a calculator that throws on zero
(`amount`, `projectValue`: "Invoice amount must be greater than zero").

Note these inputs are mostly **not** inside a `<form>`, so this is not about
the browser refusing a submit -- that is `check_form_defaults.py`'s failure
mode. It is about `checkValidity()` having nothing to report, which is what
turns "fix the highlighted input" into a promise the page cannot keep.

What counts as a bound
----------------------
Only a literal comparison against the raw input value in the venture's own
JavaScript, in one of the shapes these calculators actually use:

    if (pct < 0 || pct >= 100) throw new Error(...)
    if (rate >= 1000) throw new Error(...)
    if (amount <= 0) throw new Error(...)

The variable name must match an `<input type="number">` `id` in the same
venture. That pairing is the whole precision of this check: a guard on a
derived local is invisible to it, and an input nothing guards is left alone.
Deliberately narrow -- a bound checker that guesses gets switched off.

Usage:
    python3 platform/ci/check_input_bounds.py [root]     # default: ventures/
"""

from __future__ import annotations

import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

INPUT_RE = re.compile(r"<input\b[^>]*>", re.IGNORECASE)
ATTR_RE = re.compile(r"([a-zA-Z-]+)\s*=\s*\"([^\"]*)\"")

# `if (x >= 100) throw` and `if (x < 0 || x >= 100) throw`. The optional
# leading alternative is what lets one guard carry both bounds, which is the
# spelling most of these calculators use.
UPPER_RE = re.compile(
    r"if\s*\(\s*(?:[^)]*?\|\|\s*)?([A-Za-z_$][\w$]*)\s*(>=|>)\s*"
    r"(-?\d+(?:\.\d+)?)\s*(?:\|\|[^)]*)?\)\s*\{?\s*throw"
)
LOWER_RE = re.compile(
    r"if\s*\(\s*([A-Za-z_$][\w$]*)\s*(<=|<)\s*"
    r"(-?\d+(?:\.\d+)?)\s*(?:\|\|[^)]*)?\)\s*\{?\s*throw"
)


def _attrs(tag: str) -> dict[str, str]:
    return {name.lower(): value for name, value in ATTR_RE.findall(tag)}


def _decimal(raw: str | None) -> Decimal | None:
    if raw is None:
        return None
    try:
        return Decimal(raw.strip())
    except (InvalidOperation, ValueError):
        return None


def guards(source: str) -> dict[str, list[tuple[str, Decimal]]]:
    """Every literal bound a module throws on, keyed by the variable it reads.

    A variable can carry more than one guard across a venture's modules; each
    is kept, and the check below requires the declared attribute to satisfy
    all of them.
    """
    found: dict[str, list[tuple[str, Decimal]]] = {}
    for pattern in (UPPER_RE, LOWER_RE):
        for name, op, raw in pattern.findall(source):
            limit = _decimal(raw)
            if limit is not None:
                found.setdefault(name, []).append((op, limit))
    return found


def check_input(attrs: dict[str, str], bounds: list[tuple[str, Decimal]]) -> str | None:
    """The problem with one input's declared range, or None."""
    if attrs.get("type", "").lower() != "number":
        return None
    declared_max = _decimal(attrs.get("max"))
    declared_min = _decimal(attrs.get("min"))

    for op, limit in bounds:
        if op in (">=", ">"):
            # The smallest value the calculator refuses. `max` has to sit
            # strictly below it; absent, the field accepts anything.
            if declared_max is None:
                return (
                    f'no max, but the calculator throws when the value is {op} {limit} '
                    f"-- checkValidity() stays true, so nothing can be highlighted"
                )
            too_high = declared_max >= limit if op == ">=" else declared_max > limit
            if too_high:
                return (
                    f'max="{attrs["max"]}" still permits a value the calculator '
                    f"throws on ({op} {limit})"
                )
        else:
            if declared_min is None:
                return (
                    f'no min, but the calculator throws when the value is {op} {limit} '
                    f"-- checkValidity() stays true, so nothing can be highlighted"
                )
            too_low = declared_min <= limit if op == "<=" else declared_min < limit
            if too_low:
                return (
                    f'min="{attrs["min"]}" still permits a value the calculator '
                    f"throws on ({op} {limit})"
                )
    return None


def check_venture(directory: Path) -> list[str]:
    source = "\n".join(
        module.read_text(encoding="utf-8", errors="replace")
        for module in sorted(directory.rglob("*.mjs"))
    )
    if not source:
        return []
    bounds = guards(source)
    if not bounds:
        return []

    problems: list[str] = []
    for page in sorted(directory.rglob("*.html")):
        markup = page.read_text(encoding="utf-8", errors="replace")
        for tag in INPUT_RE.findall(markup):
            attrs = _attrs(tag)
            field = attrs.get("id")
            if not field or field not in bounds:
                continue
            problem = check_input(attrs, bounds[field])
            if problem:
                problems.append(f"{page}: {field}: {problem}")
    return problems


def check_tree(root: Path) -> list[str]:
    problems: list[str] = []
    for directory in sorted(p for p in root.iterdir() if p.is_dir()):
        problems.extend(check_venture(directory))
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path("ventures")
    if not root.exists():
        print(f"{root} does not exist", file=sys.stderr)
        return 2

    problems = check_tree(root)
    if problems:
        print(
            f"{len(problems)} input(s) accept a value their own calculator refuses:\n"
        )
        for problem in problems:
            print(f"  - {problem}")
        print(
            "\nDeclare the bound the calculator already enforces, so "
            "checkValidity() can report it and invalid.mjs can mark the field."
        )
        return 1

    print(
        f"Every guarded number input under {root}/ declares the bound its "
        "calculator enforces."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
