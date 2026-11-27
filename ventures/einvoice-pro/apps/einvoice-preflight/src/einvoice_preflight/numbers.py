"""One reading of a typed or parsed amount, shared by every check.

A number is optional sign, ASCII digits with an optional decimal point, and an
optional exponent (a JSON float such as 1e-07 arrives that way). ``Decimal``
alone also accepts ``1_000`` and Arabic-Indic digits, and JavaScript's
``Number`` accepts ``0x64``, so the CLI and the web page disagreed on such
files; this pattern is the one both now use (numbers.mjs mirrors it). XML
amounts are xs:decimal, which is stricter still (no exponent), and a receiver
rejects anything else. A magnitude of 1e15 or more is not read as a number.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

# Beyond this an amount cannot be held to the cent in the browser (a double has
# 15 to 16 significant digits), and Decimal arithmetic on it overflows the context.
MAX_DIGITS_BEFORE_POINT = 15

DECIMAL_TEXT = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?", re.ASCII)


def parse_decimal(value: Any) -> Decimal | None:
    """A finite Decimal, or None for anything that is not a plain number."""
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    if not DECIMAL_TEXT.fullmatch(text):
        return None
    try:
        result = Decimal(text)
    except ArithmeticError:  # an exponent beyond what Decimal can hold at all
        return None
    # adjusted() needs no context, unlike abs() or a comparison, which overflow on 1e999999.
    if not result.is_zero() and result.adjusted() >= MAX_DIGITS_BEFORE_POINT:
        return None
    return result
