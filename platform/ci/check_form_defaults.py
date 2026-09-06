#!/usr/bin/env python3
"""Fail the build if a calculator's own default values cannot be submitted.

Every tool here ships with a worked example already typed into the form -- that
is the whole onboarding story: land on the page, press the button, see a real
number. That story depends on the default form state passing the browser's
constraint validation, and nothing checked that it did.

When it does not, the failure is silent in the worst way. The browser refuses
the submit *before* dispatching the event, so the page's own `submit` handler
never runs. There is no exception, no console error, no validation text in the
page's own error slot -- the button simply does nothing. A page-load audit sees
a healthy page, a link check sees resolvable links, and the unit tests for
`calc.mjs` all pass, because the arithmetic was never the problem.

Two shipped products were broken this way, both by the same subtle rule:

    cam-reconciliation-check      rentableArea  min="0.01" step="1"   value="10000"
    should-i-factor-this-invoice  advancePct    min="0.01" step="0.1" value="90"

`min` is not only a lower bound. For `input type=number` it is also the *step
base*: a value is valid when it differs from `min` by a whole number of steps.
With `min="0.01"` and `step="1"` the valid values are 0.01, 1.01, 2.01, ... so
the default 10000 is a step mismatch, and so is every whole square-foot area a
visitor would plausibly type. Chrome's own message says it plainly -- "the two
nearest valid values are 9999.01 and 10000.01" -- but only if the visitor finds
the field the bubble is pointing at.

So this checks what a browser checks, on the values the page ships with:

  * `value` is a number,
  * `min <= value <= max`,
  * and `(value - step_base)` is a whole multiple of `step`.

Scope is deliberately what a browser actually blocks, and no wider:

  * Only inputs **inside a `<form>`**. Constraint validation gates form
    submission; a calculator that reads `.value` from a click handler with no
    form around it is never stopped, so a step mismatch there is cosmetic and
    flagging it would bury the two real breakages in ~30 harmless ones.
  * Only inputs the page has named a figure for -- a `value`, or (since
    2026-09-06) a `placeholder` that parses as a number. An empty field with no
    suggested figure is how a tool that needs the visitor's own data is supposed
    to start; a prose placeholder ("leave blank for band") is good copy and not
    a claim about what the field accepts.
  * Not values written by JavaScript. Rows rendered from a template literal
    carry `value="${row[1]}"` in the source; the browser never sees that text.

**Why the placeholder half was added, three weeks after the value half.** The
original scope note above says "only *prefilled* inputs", reasoning that an
empty field is awaiting the visitor's own data. That is true of a bare empty
field and false of one carrying `placeholder="95"`: there, the page has named
the figure it expects, and the visitor typing it is following an instruction.

`cam-reconciliation-check` shipped both of its occupancy gross-up fields as
`min="0.01" step="0.1"` -- a grid of 0.01, 0.11, 0.21, ... containing no whole
number at all -- beside placeholders of `100` and `95`. Its FAQ, its JSON-LD,
and `calc.mjs`'s own comments each name 95% as the usual gross-up target, so
every piece of copy on the page was instructing the visitor to type a value
that silently made the form unsubmittable. This check already understood step
bases; it was looking at the one attribute those two fields did not have.

Found by driving the page in Chromium rather than by reading it, which is the
transferable part: the whole failure mode here is one that leaves no trace in
markup, tests, or the console.

Decimal, not float: `(90 - 0.01) / 0.1` is 899.9999999999999 in binary floating
point, which would report a mismatch on a field that is fine.

Usage:
    python3 platform/ci/check_form_defaults.py [root]     # default: ventures/
"""

from __future__ import annotations

import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

INPUT_RE = re.compile(r"<input\b[^>]*>", re.IGNORECASE)
ATTR_RE = re.compile(r"""\b([a-zA-Z-]+)\s*=\s*["']([^"']*)["']""")
FORM_RE = re.compile(r"<form\b.*?</form\s*>", re.IGNORECASE | re.DOTALL)
# `value="${...}"` is a JS template placeholder in an inline script, not markup
# the browser ever parses as an attribute.
TEMPLATE_RE = re.compile(r"\$\{")


def _attrs(tag: str) -> dict[str, str]:
    return {m.group(1).lower(): m.group(2) for m in ATTR_RE.finditer(tag)}


def _decimal(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.strip())
    except (InvalidOperation, ValueError, AttributeError):
        return None


def check_input(attrs: dict[str, str]) -> str | None:
    """Return a problem description, or None if this input's default is fine."""
    if attrs.get("type", "").lower() != "number":
        return None
    raw_value = attrs.get("value", "").strip()
    source = "value"
    if not raw_value:
        # No `value`, but a numeric `placeholder` is not "awaiting the visitor's
        # own data" either -- it is the page naming the figure it expects, and a
        # visitor who types the number the page suggested and gets it refused is
        # in a worse position than one who was told nothing.
        #
        # Found on 2026-09-06 in `cam-reconciliation-check`, whose two occupancy
        # fields declare `min="0.01" step="0.1"` -- a grid of 0.01, 0.11, 0.21,
        # ... that contains no whole number at all -- beside placeholders of
        # `100` and `95`. The FAQ, the JSON-LD, and `calc.mjs`'s own comments all
        # name 95% as the usual gross-up target, and every one of them was
        # instructing the visitor to type a value that made the form unsubmittable.
        # This check already knew about step bases; it just was not looking at
        # the only figure those two fields declare.
        raw_value = attrs.get("placeholder", "").strip()
        source = "placeholder"
        if not raw_value:
            return None  # awaiting the visitor's own data; not a default at all
        if _decimal(raw_value) is None:
            # Prose, not a suggested figure -- "leave blank for band", "Defaults
            # to the session price". Three of these ship today and every one is
            # good copy. Only a placeholder the visitor could literally type into
            # the box is a claim this check can hold the markup to.
            return None
    if TEMPLATE_RE.search(raw_value):
        return None  # filled in by script at render time

    value = _decimal(raw_value)
    if value is None:
        return f'{source}="{raw_value}" is not a number'

    minimum = _decimal(attrs.get("min", ""))
    maximum = _decimal(attrs.get("max", ""))
    if minimum is not None and value < minimum:
        return f'{source}="{raw_value}" is below min="{attrs["min"]}"'
    if maximum is not None and value > maximum:
        return f'{source}="{raw_value}" is above max="{attrs["max"]}"'

    raw_step = attrs.get("step", "").strip()
    if raw_step.lower() == "any":
        return None
    step = _decimal(raw_step) if raw_step else Decimal(1)
    if step is None or step <= 0:
        return None  # a malformed step is ignored by the browser too

    # `min` doubles as the step base; without it the base is zero.
    base = minimum if minimum is not None else Decimal(0)
    offset = value - base
    if offset % step != 0:
        low = base + (offset // step) * step
        return (
            f'{source}="{raw_value}" is not reachable from min="{attrs.get("min", "0")}" '
            f'in steps of "{raw_step or 1}" (nearest valid: {low} and {low + step}) '
            f"-- the browser blocks submit, so the page's own handler never runs"
        )
    return None


def check_tree(root: Path) -> list[str]:
    problems: list[str] = []
    for page in sorted(root.rglob("*.html")):
        markup = page.read_text(encoding="utf-8", errors="replace")
        for form in FORM_RE.findall(markup):
            for tag in INPUT_RE.findall(form):
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
        print(f"{len(problems)} form default(s) a browser would refuse to submit:\n")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print(f"Every prefilled number input under {root}/ satisfies its own min/max/step.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
