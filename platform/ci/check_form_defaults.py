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
  * Only *prefilled* inputs. An empty required field is how a tool that needs
    the visitor's own data is supposed to start.
  * Not values written by JavaScript. Rows rendered from a template literal
    carry `value="${row[1]}"` in the source; the browser never sees that text.

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
    if not raw_value:
        return None  # awaiting the visitor's own data; not a default at all
    if TEMPLATE_RE.search(raw_value):
        return None  # filled in by script at render time

    value = _decimal(raw_value)
    if value is None:
        return f'value="{raw_value}" is not a number'

    minimum = _decimal(attrs.get("min", ""))
    maximum = _decimal(attrs.get("max", ""))
    if minimum is not None and value < minimum:
        return f'value="{raw_value}" is below min="{attrs["min"]}"'
    if maximum is not None and value > maximum:
        return f'value="{raw_value}" is above max="{attrs["max"]}"'

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
            f'value="{raw_value}" is not reachable from min="{attrs.get("min", "0")}" '
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
