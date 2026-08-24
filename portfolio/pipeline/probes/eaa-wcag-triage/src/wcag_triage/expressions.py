"""Template-expression matching for ``<label for>`` against control ids.

Ported from ``portfolio/research/a11y-evidence-record/audit.py`` so this
probe can adopt finding 3 of ``a11y-theme-resolution`` without importing
that research package. The probe is a standalone install; the matching
rules are the product, not a research dependency.

Two attribute values match as a *certain* name when, after expressions are
replaced by a digest of their own normalised source, the strings are
equal. ``{{id_prefix}}FirstName`` and ``{{ id_prefix }}FirstName`` are
therefore the same id. They *cannot* match when a literal cannot fit the
pattern the expressions leave behind -- which is what makes
``for="mce-NAME"`` against ``id="{{ idPrefix }}_mce-NAME"`` a proven
defect rather than an unknown.

``refs_can_match`` returning True means "cannot be ruled out", not
"matches". Callers must treat a possible-but-not-certain match as
undecidable and stay silent, because this probe fires only on positive
evidence of a barrier.
"""

from __future__ import annotations

import hashlib
import re

# Expressions are replaced by a sentinel that encodes a digest of the
# expression's own normalised source, so two attribute values written from
# the same expression compare equal while two written from different
# expressions do not. The digest is hex, so a sentinel can never contain a
# template delimiter and can never be re-matched by a later pattern.
EXPR_MARK = "\x00e:"
EXPR_SENTINEL = re.compile(r"\x00e:[0-9a-f]+\x00")
EXPR_SYNTAX = [
    re.compile(r"\{%.*?%\}", re.S),
    re.compile(r"\{\{.*?\}\}", re.S),
    re.compile(r"\{#.*?#\}", re.S),
    re.compile(r"<\?php.*?\?>", re.S),
    re.compile(r"<\?=.*?\?>", re.S),
    re.compile(r"<%.*?%>", re.S),
]


def _sentinel(match: re.Match) -> str:
    normalised = "".join(match.group(0).split())
    digest = hashlib.sha1(normalised.encode("utf-8")).hexdigest()[:12]
    return EXPR_MARK + digest + "\x00"


def strip_expressions(text: str) -> str:
    text = text.replace("\x00", "")
    for pattern in EXPR_SYNTAX:
        text = pattern.sub(_sentinel, text)
    return text


def is_expr(value: str | None) -> bool:
    return bool(value) and EXPR_MARK in value


def expr_free(value: str | None) -> str:
    """The literal part of an attribute value, with expressions removed."""
    return EXPR_SENTINEL.sub("", value or "").strip()


def _expr_pattern(value: str) -> re.Pattern:
    """``value`` as a regex in which each expression stands for any string."""
    literals = EXPR_SENTINEL.split(value)
    return re.compile(".*".join(re.escape(part) for part in literals), re.S)


def refs_can_match(a: str | None, b: str | None) -> bool:
    """Could these two already-stripped attribute values ever render equal?

    Three cases, in increasing order of doubt:

    * Two literals match only when equal.
    * A literal against an expression-bearing value matches when the
      literal fits the pattern the expressions leave behind.
    * Two expression-bearing values built from the same expressions in the
      same order reduce to their literal parts. Otherwise only the fixed
      text at each end can be checked, and anything that survives that
      returns True.
    """
    a, b = a or "", b or ""
    if a == b:
        return True
    a_expr, b_expr = is_expr(a), is_expr(b)
    if not a_expr and not b_expr:
        return False
    if a_expr != b_expr:
        literal, pattern = (b, a) if a_expr else (a, b)
        return bool(_expr_pattern(pattern).fullmatch(literal))

    a_lits, b_lits = EXPR_SENTINEL.split(a), EXPR_SENTINEL.split(b)
    if EXPR_SENTINEL.findall(a) == EXPR_SENTINEL.findall(b):
        return a_lits == b_lits

    if not (a_lits[0].startswith(b_lits[0]) or b_lits[0].startswith(a_lits[0])):
        return False
    if not (a_lits[-1].endswith(b_lits[-1]) or b_lits[-1].endswith(a_lits[-1])):
        return False
    return True


def certain_match(for_value: str, node_id: str) -> bool:
    """True only when both sides render identically, not merely possibly."""
    return strip_expressions(for_value) == strip_expressions(node_id)


def possible_match(for_value: str, node_id: str) -> bool:
    """True when a match cannot be ruled out but is not certain."""
    a, b = strip_expressions(for_value), strip_expressions(node_id)
    return a != b and refs_can_match(a, b)
