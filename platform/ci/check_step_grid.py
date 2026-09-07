#!/usr/bin/env python3
"""Fail the build if a number input's own step grid excludes whole numbers.

The third question in this family, and the one neither sibling asks.

  * `check_form_defaults.py` asks whether the value a page *ships with*
    satisfies the constraints it declares.
  * `check_input_bounds.py` asks whether those constraints are wide enough to
    let a visitor type something `calc.mjs` will throw on.
  * This asks whether the constraints are *self-consistent* -- whether the
    lattice they describe contains the numbers a human will actually type.

For `input type=number`, `min` is not only a floor: it is also the **step
base**. A value is valid when it differs from `min` by a whole multiple of
`step`. So `min="0.01" step="0.1"` describes the set

    0.01, 0.11, 0.21, 0.31, ...

which contains no whole number at all. Nobody wrote that on purpose. It is what
you get by picking a floor ("a percentage must be above zero, so 0.01") and a
spinner increment ("tenths seem right") independently, which is how every one of
the 58 instances found on 2026-09-06 arose.

Why it is worth a check of its own
----------------------------------
Two failure modes, and the severity gap between them is why this is separate.

**Inside a `<form>`, it is fatal and silent.** Constraint validation refuses the
submit *before* dispatching the event, so the page's own handler never runs:
no exception, no console error, nothing in the page's error slot. The button
does nothing. `cam-reconciliation-check` shipped its occupancy gross-up that way
-- the feature `calc.mjs` documents at length, that the FAQ and the JSON-LD both
explain, and that the field's own `placeholder="95"` invites -- and it had never
once worked in a browser. Its `calc.mjs` tests all passed, because the
arithmetic was never the problem.

**Outside a form, it is quieter but not cosmetic**, which is the correction this
file makes to `check_form_defaults.py`'s scope note. Such an input is
permanently `checkValidity() === false`. `platform/pages/invalid.mjs` uses
native invalidity as a scoring bonus when deciding which field a calculator's
error message is about (`if (isBroken(node)) score += 0.15`). A field that is
*always* broken therefore carries a standing thumb on the scale in every
"fix the highlighted input" ranking on the page -- so on a form with twenty to
forty inputs, the highlight can land on a field the visitor typed correctly.
That is precisely the defect `invalid.mjs` was built to remove, reintroduced
through the back door.

The fix is `step="any"`
-----------------------
It preserves `min` and `max` exactly and accepts every value the calculator
accepts. The only thing given up is spinner-arrow granularity, and HTML offers
no way to keep a coarse increment while accepting arbitrary input -- so between
"the arrows jump by 50" and "the number you typed is accepted", the second wins
every time.

Decimal, not float: `Decimal("0.3") % Decimal("0.1")` is exactly 0, while the
binary float version is not.

Usage:
    python3 platform/ci/check_step_grid.py [root]     # default: ventures/
"""

from __future__ import annotations

import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

INPUT_RE = re.compile(r"<input\b[^>]*>", re.IGNORECASE)
ATTR_RE = re.compile(r"""\b([a-zA-Z-]+)\s*=\s*["']([^"']*)["']""")


def _attrs(tag: str) -> dict[str, str]:
    return {m.group(1).lower(): m.group(2) for m in ATTR_RE.finditer(tag)}


def _decimal(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.strip())
    except (InvalidOperation, ValueError, AttributeError):
        return None


def check_input(attrs: dict[str, str]) -> str | None:
    """Return a problem description, or None if this input's grid is sane."""
    if attrs.get("type", "").lower() != "number":
        return None

    raw_step = attrs.get("step", "").strip()
    if not raw_step or raw_step.lower() == "any":
        return None  # no grid, or an explicitly free one
    raw_min = attrs.get("min", "").strip()
    if not raw_min:
        return None  # base is 0, so every multiple of step is reachable

    step = _decimal(raw_step)
    minimum = _decimal(raw_min)
    if step is None or minimum is None or step <= 0:
        return None  # malformed; the browser ignores it too

    if minimum % step == 0:
        return None

    # The first two grid points, which is what makes the report actionable:
    # seeing "0.01 and 0.11" is what turns this from an abstract rule into an
    # obvious mistake.
    return (
        f'min="{raw_min}" is not a multiple of step="{raw_step}", so the accepted '
        f"values are {minimum}, {minimum + step}, {minimum + step * 2}, ... and no "
        f'whole number is among them -- use step="any"'
    )


def check_tree(root: Path) -> list[str]:
    problems: list[str] = []
    for page in sorted(root.rglob("*.html")):
        markup = page.read_text(encoding="utf-8", errors="replace")
        for tag in INPUT_RE.findall(markup):
            attrs = _attrs(tag)
            problem = check_input(attrs)
            if problem:
                field = attrs.get("id") or attrs.get("name") or "(unnamed input)"
                problems.append(f"{page}: {field}: {problem}")
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path("ventures")
    if not root.exists():
        print(f"{root} does not exist", file=sys.stderr)
        return 2

    problems = check_tree(root)
    if problems:
        print(f"{len(problems)} number input(s) whose step grid excludes whole numbers:\n")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print(f"Every number input under {root}/ has a step grid a visitor can land on.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
