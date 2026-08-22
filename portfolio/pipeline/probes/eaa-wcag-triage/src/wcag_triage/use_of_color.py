"""WCAG 1.4.1 "Use of Color", for the one slice of it this artifact can decide:
**a link inside a run of body text, distinguished from the words around it by
colour and nothing else.**

The full criterion is broader than links — any use of colour as the sole
carrier of information is in scope. Only the link case is built here, because
it is the only one the project's own coverage catalog (see
:data:`wcag_triage.rules.COVERAGE`) found to be decidable from a static
artifact: a stylesheet that names its colours also, in the same declarations,
states or omits the non-colour cues (underline, weight, style, border,
background) that would make a link identifiable without colour. Everything
else 1.4.1 covers — a colour-coded chart legend, a form field marked invalid
only by a red border, "click the green button" instructions — needs the
rendered page or a human reading the copy, and stays out of scope here.

Same discipline as :mod:`wcag_triage.contrast`, reusing its machinery
directly rather than re-deriving it: three-valued verdict (``pass`` / ``fail``
/ ``undecidable``), a named reason for every refusal, and no default assumed
that is not the CSS specification's own initial value. That last point is
why this module treats an *undeclared* colour, background, border, weight or
style the same way :mod:`wcag_triage.contrast` does — as the property's
initial value (transparent, none, normal) — with one deliberate exception:
**an undeclared ``text-decoration`` on the link itself is refused, not
defaulted.** A browser's user-agent stylesheet underlines an ``<a>`` by
default, and that default is not the CSS initial value (which is ``none``);
it is a per-tag rule this module never sees, so an artifact that never
mentions ``text-decoration`` genuinely does not say whether the link is
underlined. The same absence on the surrounding *non-link* text has no such
hidden default — plain text is never underlined by a browser on its own — so
there it safely resolves to "no decoration". Getting this asymmetry backwards
in either direction manufactures a verdict from a browser behaviour the file
never stated.

This module reaches into :mod:`wcag_triage.contrast`'s private declaration
resolver (``_declared_ranked``) and per-element colour/background readers
(``_resolve_foreground``, ``_background_paint``) rather than duplicating that
cascade logic. Both modules live in this package and answer the same
question — "what does the stylesheet say about this element" — so the
private name is reused on purpose, matching the requirement to point the
existing colour machinery at a new comparison instead of writing a second
one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from . import contrast
from .css import LIGHT, SCHEMES, Stylesheet
from .parser import Node

PASS = contrast.PASS
FAIL = contrast.FAIL
UNDECIDABLE = contrast.UNDECIDABLE

# Named reasons. As in `contrast.py`, the taxonomy *is* the result.
UNDECIDABLE_REASONS = (
    "no-declared-color",
    "unresolvable-color",
    "conditional-color",
    "no-declared-text-decoration",
    "conditional-text-decoration",
    "conditional-font-weight",
    "conditional-font-style",
    "conditional-border",
    "conditional-background",
    "background-image",
    "unresolvable-background",
)

_BOLD_WEIGHT = contrast.BOLD_WEIGHT
_NONE_LIKE = {"none", "0", "0px", "", "unset", "initial"}
_INHERIT_LIKE = {"inherit", "unset", "initial"}


@dataclass(frozen=True)
class LinkColorResult:
    """The verdict for one candidate link."""

    verdict: str  # PASS, FAIL or UNDECIDABLE
    reason: str = ""
    link_color: Optional[str] = None
    surrounding_color: Optional[str] = None

    @property
    def decided(self) -> bool:
        return self.verdict in (PASS, FAIL)


def _undecidable(reason: str) -> LinkColorResult:
    return LinkColorResult(verdict=UNDECIDABLE, reason=reason)


# ---------------------------------------------------------------------------
# Candidate selection.
# ---------------------------------------------------------------------------


def _direct_text(node: Node) -> str:
    return " ".join(part.strip() for part in node.text_parts if part and part.strip())


def is_inline_text_link(node: Node) -> bool:
    """A text-bearing ``<a>`` sitting inside a run of its parent's own text.

    This is the gate that scopes the rule to the case the coverage note
    describes — "a link distinguished from surrounding body text" — rather
    than a nav item, a card whose only content is the link, or an icon
    button. It requires:

    * an ``<a href>`` that is not hidden and has some accessible text (an
      icon-only link is a naming question, not a colour question), and
    * a parent that carries its *own* non-whitespace text directly (not only
      inside child elements) — the plain words the link needs to stand out
      from. Without this, a link that *is* the entire content of its
      container (a nav link, a product-card link) would be scored against
      body text that does not exist.
    """
    if node.tag != "a" or not node.has_attr("href"):
        return False
    if contrast.is_hidden(node):
        return False
    if not node.accessible_text():
        return False
    parent = node.parent
    if parent is None:
        return False
    return bool(_direct_text(parent))


def candidate_links(root: Node) -> list:
    """Every link this module will evaluate, in document order."""
    return [node for node in root.iter() if is_inline_text_link(node)]


# ---------------------------------------------------------------------------
# Per-property resolution. Each walks `node` then its ancestors (except
# border/background, which are not inherited and are read from the link
# itself only) and returns `(value, reason)` — `value` is `None` only when
# `reason` names why it could not be decided.
# ---------------------------------------------------------------------------


def _walk(sheet: Stylesheet, node: Node, prop: str, scheme: str):
    """`(declaration, reason)` for the first level of the ancestor chain that
    declares `prop` unconditionally, or `(None, "conditional-<prop>")` if the
    winning level is only painted by a conditional rule, or `(None, None)` if
    nothing in the chain declares it at all."""
    for current in [node] + list(node.ancestors()):
        declaration = contrast._declared_ranked(sheet, current, prop, scheme)
        if declaration is None:
            continue
        if declaration.value is None:
            return (None, f"conditional-{prop}")
        text = declaration.value.strip().lower()
        if text in _INHERIT_LIKE:
            continue
        if declaration.variants:
            return (None, f"conditional-{prop}")
        return (text, None)
    return (None, None)


def _decoration_state(sheet: Stylesheet, node: Node, scheme: str, is_link: bool):
    """Whether a decoration line (underline/overline/line-through) is in force."""
    for prop in ("text-decoration-line", "text-decoration"):
        text, reason = _walk(sheet, node, prop, scheme)
        if reason is not None:
            return (None, reason)
        if text is not None:
            return (text != "none" and text not in _NONE_LIKE, None)
    # Never declared anywhere in the chain.
    if is_link:
        # A browser underlines a link by default, but that default is a
        # per-tag user-agent rule, not the property's CSS initial value —
        # this artifact never states it, so it is genuinely unknown.
        return (None, "no-declared-text-decoration")
    # Plain text carries no such hidden default; absence really is "none".
    return (False, None)


def _weight_is_bold(text: str) -> bool:
    if text in {"bold", "bolder"}:
        return True
    try:
        return float(text) >= _BOLD_WEIGHT
    except ValueError:
        return False


def _style_is_italic(text: str) -> bool:
    return text in {"italic", "oblique"} or text.startswith("oblique")


def _bold_state(sheet: Stylesheet, node: Node, scheme: str):
    text, reason = _walk(sheet, node, "font-weight", scheme)
    if reason is not None:
        return (None, reason)
    return (_weight_is_bold(text) if text is not None else False, None)


def _italic_state(sheet: Stylesheet, node: Node, scheme: str):
    text, reason = _walk(sheet, node, "font-style", scheme)
    if reason is not None:
        return (None, reason)
    return (_style_is_italic(text) if text is not None else False, None)


def _link_has_border(sheet: Stylesheet, node: Node, scheme: str):
    """Whether the link *itself* carries a border. Not inherited, so unlike
    decoration/weight/style this checks only the link's own declarations —
    a border on an ancestor does not wrap the inline link text."""
    for prop in ("border", "border-bottom"):
        declaration = contrast._declared_ranked(sheet, node, prop, scheme)
        if declaration is None:
            continue
        if declaration.value is None:
            return (None, f"conditional-{prop}")
        text = declaration.value.strip().lower()
        if text in _INHERIT_LIKE:
            continue
        if declaration.variants:
            return (None, f"conditional-{prop}")
        if text not in _NONE_LIKE:
            return (True, None)
    return (False, None)


def _link_has_background(sheet: Stylesheet, node: Node, scheme: str):
    """Whether the link itself paints a background — also not inherited."""
    kind, _payload, reason = contrast._background_paint(sheet, node, scheme)
    if kind == "unknown":
        return (None, reason)
    return (kind in ("color", "gradient"), None)


# ---------------------------------------------------------------------------
# Per-link evaluation.
# ---------------------------------------------------------------------------


def evaluate(sheet: Stylesheet, link: Node, scheme: str = LIGHT) -> LinkColorResult:
    """Decide SC 1.4.1 for one candidate link under one colour scheme.

    Refuses (``undecidable``, named reason) the moment any one factor cannot
    be read from the stylesheet. Colour is resolved first and, if it is not
    even a difference between the link and its surroundings, the verdict is
    ``pass`` immediately — a link that looks identical to the text around it
    is not using colour to signal anything, and no other factor needs to be
    asked. Otherwise every remaining factor (decoration, weight, style,
    border, background) has to resolve before the verdict is decided:
    ``pass`` if any one of them also differs, ``fail`` if none does.
    """
    parent = link.parent

    link_color, reason = contrast._resolve_foreground(sheet, link, scheme)
    if link_color is None:
        return _undecidable(reason)
    surrounding_color, reason = contrast._resolve_foreground(sheet, parent, scheme)
    if surrounding_color is None:
        return _undecidable(reason)

    colors_differ = (
        link_color.hex() != surrounding_color.hex() or abs(link_color.a - surrounding_color.a) > 0.02
    )
    if not colors_differ:
        # Colour is not even a difference here, so it cannot be the *sole*
        # cue -- whatever else is or is not declared is beside the point for
        # this criterion, and asking would only manufacture a refusal this
        # verdict does not need.
        return LinkColorResult(
            verdict=PASS, link_color=link_color.hex(), surrounding_color=surrounding_color.hex()
        )

    decoration_link, reason = _decoration_state(sheet, link, scheme, is_link=True)
    if decoration_link is None:
        return _undecidable(reason)
    decoration_surrounding, reason = _decoration_state(sheet, parent, scheme, is_link=False)
    if decoration_surrounding is None:
        return _undecidable(reason)

    bold_link, reason = _bold_state(sheet, link, scheme)
    if bold_link is None:
        return _undecidable(reason)
    bold_surrounding, reason = _bold_state(sheet, parent, scheme)
    if bold_surrounding is None:
        return _undecidable(reason)

    italic_link, reason = _italic_state(sheet, link, scheme)
    if italic_link is None:
        return _undecidable(reason)
    italic_surrounding, reason = _italic_state(sheet, parent, scheme)
    if italic_surrounding is None:
        return _undecidable(reason)

    has_border, reason = _link_has_border(sheet, link, scheme)
    if has_border is None:
        return _undecidable(reason)

    has_background, reason = _link_has_background(sheet, link, scheme)
    if has_background is None:
        return _undecidable(reason)

    common = {
        "link_color": link_color.hex(),
        "surrounding_color": surrounding_color.hex(),
    }

    other_distinction = (
        decoration_link != decoration_surrounding
        or bold_link != bold_surrounding
        or italic_link != italic_surrounding
        or has_border
        or has_background
    )
    if other_distinction:
        return LinkColorResult(verdict=PASS, **common)
    return LinkColorResult(verdict=FAIL, **common)


def _worst_of(results: list) -> LinkColorResult:
    """Combine one link's verdicts across colour schemes — same policy as
    `contrast.worst_of`: a decided failure in any scheme is a failure, else
    any undecided scheme leaves the link undecided."""
    if not results:
        return _undecidable("no-declared-color")
    fails = [r for r in results if r.verdict == FAIL]
    if fails:
        return fails[0]
    undecided = [r for r in results if r.verdict == UNDECIDABLE]
    if undecided:
        return undecided[0]
    return results[0]


def evaluate_document(root: Node, sheet: Stylesheet, schemes: tuple = SCHEMES) -> list:
    """``[(Node, LinkColorResult), ...]`` for every candidate link."""
    out = []
    for link in candidate_links(root):
        out.append((link, _worst_of([evaluate(sheet, link, scheme) for scheme in schemes])))
    return out
