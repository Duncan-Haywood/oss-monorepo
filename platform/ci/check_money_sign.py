#!/usr/bin/env python3
"""Fail if a venture formats money with the minus sign inside the currency symbol.

Why this exists
---------------
Every venture vendors its own `money()` -- inline in an `index.html`, in a
`calc.mjs`, in the proposal module -- because `platform/pages/build.mjs`
publishes each venture directory on its own, so a cross-tree import would 404 on
the live site. On 2026-08-28 there were 222 copies of one function, and it was
wrong in two ways nobody had noticed:

    money(-9.24)  -> "$-9.24"   the sign belongs outside the symbol: "-$9.24"
    money(-0.004) -> "$-0.00"   a break-even line claiming to be down money

Both are visible on any tool that prints a difference, and 11,172 unit tests
went green over them because not one asserted on a negative rendering. What
found them was loading the pages in a browser and reading the tables: "$-338.40"
against a Shopify plan, "$-14.00" for disposing a Walmart return, "$-9.24" in
the Faire discount column.

So the arithmetic was never the risk here -- the spelling was, and a spelling
defect in a vendored function is exactly the thing that comes back. A new
calculator lands most days, usually by copying the nearest existing one, and the
broken spelling is the one that had a 222-copy head start.

What is checked
---------------
A `money`-shaped formatter whose template literal opens with `$${`, which is
what interpolating a possibly-negative number straight after a "$" looks like.
Formatters that decide a sign of their own (`signedMoney`, which also prints a
"+") are left alone: they are not this bug.

Run it locally the same way CI does:

    python3 platform/ci/check_money_sign.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES = REPO_ROOT / "ventures"

# Only `money`-shaped names. `signedMoney` and friends already place a sign.
NAME = r"(?:money|moneyLabel|fmtMoney|formatMoney|money0|money2|usd)"

# `const money = (value) => `$${...}`` and `function money(value) { return `$${...}` }`,
# in every parameter spelling the copies drifted into.
#
# Matched against the whole file rather than line by line: the declaration form
# puts its `return` on the next line, which is the form all 31 `calc.mjs` copies
# used. A line-scanning version of this check passed the repository while that
# spelling was still in it.
PATTERNS = (
    re.compile(r"(?:const|let)\s+" + NAME + r"\s*=\s*\(?[A-Za-z_$][\w$]*\)?\s*=>\s*`\$\$\{"),
    re.compile(r"function\s+" + NAME + r"\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*return\s+`\$\$\{"),
)

# The two patterns above require the body to *open* with the template literal.
# A formatter that guards first slips straight through them -- measured
# 2026-09-07 on `kdp-royalty-calculator/index.html`, which shipped
#
#     const money = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : 'not available');
#
# and rendered a 400-page $6.99 paperback's per-copy net as "$-1.46" on the
# live site while this check reported the repository clean. Its sibling
# `calc.mjs` used the unguarded spelling and *was* caught, so the venture
# turned CI red and the on-screen defect was still not the thing that failed.
# That is the worse half of the bug: a green check over a visible defect.
#
# So the body is read as a whole rather than by its first token. The signal
# that separates a correct guarded formatter from a broken one is whether it
# takes the magnitude before interpolating: `where-to-sell-calculator` spells
# it `value < 0 ? `−$${Math.abs(value)...}` : ...` and is right. Anything that
# interpolates straight after a "$" without ever reaching for `Math.abs` is
# formatting a negative into the wrong place.
BODY_START = re.compile(
    r"(?:const|let)\s+" + NAME + r"\s*=\s*\(?[A-Za-z_$][\w$]*\)?\s*=>\s*"
    r"|function\s+" + NAME + r"\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*(?=\{)"
)

# A `$` immediately followed by a template interpolation, i.e. `` `$${x}` ``.
INTERPOLATES_AFTER_SYMBOL = re.compile(r"\$\$\{")

# Taking the magnitude first is what a correct formatter does; a "−$"/"-$"
# literal is the other correct spelling (the sign is already outside).
TAKES_MAGNITUDE = re.compile(r"Math\.abs\s*\(|[-−]\$")


def _body_after(text: str, start: int) -> str:
    """The formatter's body: balanced to its closing brace, else to its `;`.

    Only ever used to ask two yes/no questions of the body, so it does not need
    to be a parser -- it needs to stop before the *next* declaration, which is
    what a naive fixed-size window fails to do on a minified line.
    """
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char in "{([":
            depth += 1
        elif char in "})]":
            if depth == 0:
                return text[start:index]
            depth -= 1
        elif char in ";\n" and depth == 0:
            return text[start:index]
    return text[start:]

SUFFIXES = (".html", ".mjs")


def source_files():
    """Every venture source a visitor's browser could run. Tests excluded."""
    for path in sorted(VENTURES.glob("*/*")):
        if path.suffix not in SUFFIXES:
            continue
        name = path.name
        if name.endswith(".test.mjs") or name.startswith("test_") or name.endswith("_test.mjs"):
            continue
        yield path


def findings_in(path: Path):
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return
    lines = text.splitlines()
    seen: set[int] = set()

    def report(offset: int):
        number = text.count("\n", 0, offset) + 1
        if number in seen:
            return None
        seen.add(number)
        return number, lines[number - 1]

    for pattern in PATTERNS:
        for match in pattern.finditer(text):
            found = report(match.start())
            if found:
                yield found

    # The guarded spellings the two patterns above cannot see. Reported through
    # the same `seen` set so a formatter both agree on is named once.
    for match in BODY_START.finditer(text):
        body = _body_after(text, match.end())
        if not INTERPOLATES_AFTER_SYMBOL.search(body):
            continue
        if TAKES_MAGNITUDE.search(body):
            continue
        found = report(match.start())
        if found:
            yield found


def main() -> int:
    findings = [
        (path, number, line)
        for path in source_files()
        for number, line in findings_in(path)
    ]

    if not findings:
        print("No money() formatter puts the sign inside the currency symbol.")
        return 0

    files = sorted({path for path, _, _ in findings})
    print(f"{len(findings)} money() formatter(s) across {len(files)} file(s) sign a negative as \"$-9.24\":\n")
    for path, number, line in findings:
        print(f"  {path.relative_to(REPO_ROOT)}:{number}: {line.strip()[:100]}")
    print(
        "\nFormat the magnitude, then place the sign outside the symbol, and do"
        "\nnot sign a value that is zero once formatted:"
        "\n"
        "\n  const money = (value) => {"
        "\n    const format = (value) => `$${value.toFixed(2)}`;"
        "\n    const text = format(Math.abs(value));"
        "\n    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;"
        "\n  };"
        "\n"
        "\n`node platform/ci/fix_money_sign.mjs` applies exactly that, and is a"
        "\nno-op on a formatter already written this way."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
