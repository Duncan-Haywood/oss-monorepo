"""WCAG 1.4.1 Use of Color, for the one shape of it an artifact decides.

The criterion is broad — "colour is not used as the only visual means of
conveying information" — and most of it needs someone to read the page. One
shape of it does not, and it is the shape that occurs on nearly every page ever
written: **a link inside a block of body text, distinguished from that text by
its colour alone**. Take the colour away, as a monochrome display or the
commonest form of colour blindness effectively does, and the link stops being a
link. Nothing in the prose says it is one.

That case is decidable here for the same reason 1.4.3 turned out to be (see
:mod:`wcag_triage.contrast`): the page ships the stylesheet that names both
colours, and the arithmetic between them is exact. What is new is *which two
colours*. 1.4.3 compares text against its background; this compares text
against **other text** — the link against the prose around it — and the
threshold is the one WCAG's own technique G183 names, 3:1.

Colour is not the only way to mark a link, and a link marked any other way
passes this check whatever its colour: an underline, a border, a different
weight or family, a background of its own. So the question this module answers
is a conjunction:

1. Is the link inside a block of prose at all — running text rather than a box
   of its own, with more text around it than in it? A navigation bar is a list
   of links; nothing there is disguised as prose, and firing on it would be the
   sort of finding that gets a checker turned off. Both halves of that gate are
   the reference engine's, and the second replaced a threshold of this module's
   own that measurement refuted — see :func:`links_in_text`.
2. Does it carry any non-colour distinction? **The browser's own default counts
   here** — a bare ``<a href>`` is underlined by every UA stylesheet, so a page
   that says nothing about decoration passes. This rule fires only where the
   page has actively taken the underline away, which is what a CSS reset (and
   every Tailwind build, whose preflight sets ``a { text-decoration: inherit }``)
   does.
3. Do the two colours resolve, and is the ratio between them below 3:1?

Only when the answers are *yes, no, yes* is there a finding. Every unresolved
step yields ``undecidable`` with a named reason and no finding, the same
direction of refusal the rest of this probe commits to.

One asymmetry with :mod:`wcag_triage.contrast` is worth naming, because it is
why this module can decide pages that one calls undecidable. Contrast needs an
*absolute* colour on both sides, and a page that declares no colour at all
leaves the background unknown. Here both sides are text in the same inherited
chain, so when neither declares a colour they are necessarily the *same*
colour, whatever it is, and the ratio is exactly 1.0 with nothing assumed. When
only one side declares one, the other is CSS's initial ``canvastext`` — black
in a document that has not opted into a dark colour scheme, which
:func:`_initial_text_color` checks for rather than assumes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from . import contrast
from .colors import Rgba, contrast_ratio, parse_color
from .css import LIGHT, SCHEMES, Stylesheet
from .parser import Node

# WCAG technique G183 sets the contrast a colour-only distinction has to reach
# against the surrounding text: 3:1. Same number the reference engine uses.
LINK_TEXT_RATIO = 3.0

# CSS's initial `color` is `canvastext`, which is black in a document rendered
# in the light colour scheme. Used only for a side that declares no colour at
# all, and only when nothing in the document opts into a dark scheme — see
# `_initial_text_color`.
INITIAL_TEXT_COLOR = Rgba(0.0, 0.0, 0.0, 1.0)

# Values of `display` that take a link out of the running text: a link laid out
# as its own box is a button or a card, not a phrase inside a sentence, whatever
# text sits beside it. Same list the reference engine treats as block-like.
_BLOCK_DISPLAYS = frozenset(
    {"block", "list-item", "table", "flex", "grid",
     "inline-block", "inline-flex", "inline-grid"}
)

# Containers whose children CSS blockifies: a flex or grid item computes to a
# block box whatever its own `display` said, so a link inside one is laid out
# as a box beside its siblings rather than as a phrase inside a line.
_BLOCKIFYING_DISPLAYS = frozenset(
    {"flex", "inline-flex", "grid", "inline-grid"}
)

PASS = contrast.PASS
FAIL = contrast.FAIL
UNDECIDABLE = contrast.UNDECIDABLE

UNDECIDABLE_REASONS = (
    "unresolvable-link-color",
    "unresolvable-surrounding-color",
    "translucent-text",
    "unresolvable-decoration",
    "unknown-color-scheme",
)

# Elements that establish a block of prose. A link's "surrounding text" is the
# text of the nearest one of these that contains it.
#
# This is the set of HTML elements every UA stylesheet lays out as a block, not
# a judgement about which ones "look like prose" — the distinction matters and
# `<nav>` is why. Leaving it out let a navigation bar's block parent resolve to
# `<body>`, which then borrowed the article's prose as the text "around" a menu
# item. The reference engine avoids that by reading a computed display; this
# reads the UA default, which for these tags is fixed and needs no browser.
BLOCK_TAGS = frozenset(
    {
        "p", "li", "td", "th", "dd", "dt", "dl", "blockquote", "figcaption",
        "div", "section", "article", "aside", "main", "header", "footer",
        "body", "h1", "h2", "h3", "h4", "h5", "h6", "caption", "summary",
        "nav", "ul", "ol", "menu", "form", "fieldset", "figure", "address",
        "pre", "hgroup", "details", "dialog", "search", "table", "thead",
        "tbody", "tfoot", "tr", "hr",
    }
)

_TEXT_OPAQUE = frozenset({"script", "style", "template", "noscript"})

# Values of `text-decoration` / `text-decoration-line` that mark text visibly.
_DECORATION_MARKS = ("underline", "overline", "line-through")
# Values that resolve to no decoration of the element's own.
_NO_DECORATION = frozenset({"none", "initial", "unset"})
# Values that hand the question to the parent element.
_INHERITED_DECORATION = frozenset({"inherit"})
# Values that hand it back to the UA stylesheet, where a link is underlined.
_UA_DECORATION = frozenset({"revert", "revert-layer"})

# Non-colour properties that can mark a link out from the prose around it.
# `background-image` is here rather than under colour because a background
# image survives a monochrome rendering.
_DISTINCT_PROPERTIES = (
    "font-weight",
    "font-style",
    "font-family",
    "border",
    "border-width",
    "border-style",
    "border-bottom",
    "border-bottom-width",
    "border-bottom-style",
    "outline",
    "outline-width",
    "outline-style",
    "background-image",
    "background-color",
    "background",
)

# Values of the properties above that mark nothing: a declaration holding one
# of these is not a distinction even though it is a declaration.
_NO_OP_VALUES = frozenset(
    {
        "none", "0", "0px", "normal", "initial", "unset", "inherit",
        "transparent", "auto", "revert",
    }
)


@dataclass(frozen=True)
class LinkResult:
    """The 1.4.1 verdict for one link, under one colour scheme or combined."""

    verdict: str
    reason: str = ""
    ratio: Optional[float] = None
    link_color: Optional[str] = None
    text_color: Optional[str] = None
    distinguisher: str = ""

    @property
    def decided(self) -> bool:
        return self.verdict in (PASS, FAIL)


def _undecidable(reason: str) -> LinkResult:
    return LinkResult(verdict=UNDECIDABLE, reason=reason)


# ---------------------------------------------------------------------------
# Structure: which links are in a block of text, and what text is around them.
# ---------------------------------------------------------------------------


def _block_of(node: Node, sheet: Optional[Stylesheet] = None) -> Optional[Node]:
    """The nearest ancestor that lays out as a block.

    A tag from ``BLOCK_TAGS`` (the UA stylesheet's own block elements), or any
    element the page's CSS gives a block-like ``display`` — a ``<span
    class="flex">`` wrapper is a block box however inline its tag is.
    """
    for ancestor in node.ancestors():
        if ancestor.tag in BLOCK_TAGS:
            return ancestor
        if sheet is not None and _declared_display(sheet, ancestor) in _BLOCK_DISPLAYS:
            return ancestor
    return None


def _text_outside_links(node: Node, link: Node) -> list:
    """``[(owner, text)]`` for text in ``node`` that is not inside any link.

    The owner is carried because the colour of the surrounding prose is a
    property of the element that holds it, not of the block: a block can hold
    text in two colours and the link has to be checked against both.
    """
    if node is link or node.tag in _TEXT_OPAQUE:
        return []
    if node.tag == "a" and node.has_attr("href"):
        return []  # another link's text is not prose
    if contrast.is_hidden(node):
        return []
    out = []
    own = " ".join(part.strip() for part in node.text_parts if part and part.strip())
    if own:
        out.append((node, own))
    for child in node.children:
        out.extend(_text_outside_links(child, link))
    return out


def _link_text_in(block: Node) -> int:
    """Characters of text inside links within this block.

    All of them, not just the one being checked: the reference engine measures
    the whole block's link text against the whole block's prose, and a row of
    three links beside a short caption is a list however the caption is worded.
    """
    total = 0
    for node in block.iter():
        if node.tag == "a" and node.has_attr("href") and not contrast.is_hidden(node):
            total += len(node.accessible_text().strip())
    return total


def _declared_display(sheet: Stylesheet, node: Node) -> Optional[str]:
    for scheme in SCHEMES:
        declaration = contrast._declared_ranked(sheet, node, "display", scheme)
        if declaration is not None and declaration.value is not None:
            return declaration.value.strip().lower()
    return None


def _laid_out_as_a_block(sheet: Optional[Stylesheet], node: Node) -> bool:
    """Whether this link is a box of its own rather than a phrase in a line.

    Two ways that happens, and the second is the one that matters in practice.
    A link can say so itself (``display: block``) — or it can be a **child of a
    flex or grid container**, which CSS *blockifies* whatever the child asked
    for. Nothing in the link's own declarations records that, which is why a
    reader that only looks at the element gets it wrong: out of sample, three
    of this rule's five findings were header buttons in a
    ``<div class="flex items-center">``, sitting beside a heading long enough
    to count as prose. The reference engine reads a computed style and sees
    ``display: block`` on them; this reads the parent's declaration and reaches
    the same conclusion from the file.
    """
    if sheet is None:
        return False
    own = _declared_display(sheet, node)
    if own in _BLOCK_DISPLAYS:
        return True
    parent = node.parent
    if parent is not None and _declared_display(sheet, parent) in _BLOCKIFYING_DISPLAYS:
        return True
    return False


def links_in_text(root: Node, sheet: Optional[Stylesheet] = None) -> list:
    """``[(link, block, [(owner, text)])]`` for every link inside prose.

    Two gates decide what "inside prose" means, and both are the reference
    engine's (axe-core 4.13.0, ``commons/dom/is-in-text-block``) rather than
    this module's invention:

    - **The link is not laid out as its own box.** A ``display: block`` link is
      a card or a button; nothing about it is trying to look like running text.
    - **The prose outweighs the links.** The block's non-link text has to be
      longer than its link text. This replaced a fixed 25-character floor,
      which was wrong out of sample in a way worth recording: on the one page
      in this portfolio's 118 where the reference reports 1.4.1, the floor
      produced **6 findings against the reference's 1**, and all 5 it added
      were the same shape — a file-list row, ``<li><a>Long report title</a> —
      <code>file.html</code></li>``, where the surrounding text clears any
      short floor and the link is still the row rather than a phrase inside
      one. A length comparison is scale-free where a floor is not: it fires on
      a one-line sentence and stays silent on a list of long titles.
    """
    out = []
    for node in root.iter():
        if node.tag != "a" or not node.has_attr("href"):
            continue
        if contrast.is_hidden(node) or not node.accessible_text().strip():
            continue
        if _laid_out_as_a_block(sheet, node):
            continue
        block = _block_of(node, sheet)
        if block is None:
            continue
        surrounding = _text_outside_links(block, node)
        prose = sum(len(text) for _, text in surrounding)
        if prose <= _link_text_in(block):
            continue
        out.append((node, block, surrounding))
    return out


# ---------------------------------------------------------------------------
# Distinction by anything other than colour.
# ---------------------------------------------------------------------------


def _decorated(sheet: Stylesheet, node: Node, scheme: str) -> Optional[bool]:
    """Whether this link renders with a text decoration. ``None`` if unknown.

    ``text-decoration`` is not an inherited property, but it *propagates* to
    descendants visually, and a reset that writes ``a { text-decoration:
    inherit }`` — which is what Tailwind's preflight does, and the single
    commonest reason a modern page fails this criterion — asks explicitly for
    the parent's value. Both cases are the same walk up the tree.

    **Where the UA default applies is the whole question**, and getting it
    wrong is silent in the direction that hurts. The underline a browser gives
    a link comes from its UA stylesheet, so it applies only while nothing in
    the page has declared anything for this element. The moment the page's own
    reset says ``a { text-decoration: inherit }``, the UA rule is overridden
    and the value is the *parent's* — which, on an ordinary paragraph that
    declares nothing, is the initial value ``none``. Reading that chain as
    "nobody said anything, so the browser underlines it" is wrong, and it is
    wrong on every Tailwind build, whose preflight ships exactly that reset:
    across this portfolio's own 118-page corpus it turned **152 links that are
    not underlined into passes**. The first version of this function did that.

    A ``:hover`` rule is invisible to :mod:`wcag_triage.css` by construction
    (it reads no pseudo-selectors), and that is the right answer here as well
    as a limitation: a distinction that appears only on hover is not one for a
    reader who has not hovered, which is every reader who has not already found
    the link.
    """
    chain = [node] + list(node.ancestors())
    for index, current in enumerate(chain):
        declaration = None
        for prop in ("text-decoration-line", "text-decoration"):
            found = contrast._declared_ranked(sheet, current, prop, scheme)
            if found is None:
                continue
            if declaration is None or found.weight >= declaration.weight:
                declaration = found
        if declaration is None:
            if index == 0:
                # Nothing in the page touches the link's own decoration, so the
                # UA stylesheet still applies and it is underlined.
                return True
            continue  # an ancestor that says nothing inherits from further up
        if declaration.value is None:
            return None  # declared only inside a condition the file leaves open
        value = declaration.value.strip().lower()
        if any(mark in value for mark in _DECORATION_MARKS):
            return True
        if value in _UA_DECORATION:
            # `revert` hands the element back to the UA stylesheet, which
            # underlines a link and decorates nothing else.
            return current.tag == "a"
        if value in _NO_DECORATION:
            return False
        if value in _INHERITED_DECORATION:
            continue  # the parent's value is this element's value
        return None  # something this reader does not understand
    # The chain ended in inheritance with nothing declared above it: the value
    # is `text-decoration`'s initial one, which is no decoration at all. The UA
    # rule that would have underlined the link was overridden by whichever
    # declaration started this walk.
    return False


def _distinguisher(sheet: Stylesheet, link: Node, block: Node, scheme: str) -> str:
    """A non-colour difference between the link and its prose, or ``""``.

    Deliberately generous: any declaration on the link that the surrounding
    block does not share counts, without checking that the difference is large
    enough to notice. A border of ``1px`` and a font one weight heavier are
    both marginal marks in practice, and this rule treats them as sufficient —
    it under-reports on purpose, because the cost of a wrong finding here is
    an argument with a customer about a link that looks fine to them.
    """
    for prop in _DISTINCT_PROPERTIES:
        own = contrast._declared_ranked(sheet, link, prop, scheme)
        if own is None or own.value is None:
            continue
        value = own.value.strip().lower()
        if not value or value in _NO_OP_VALUES:
            continue
        around = contrast._declared_ranked(sheet, block, prop, scheme)
        if around is not None and around.value is not None:
            if around.value.strip().lower() == value:
                continue
        return f"{prop}: {own.value.strip()}"
    return ""


# ---------------------------------------------------------------------------
# The two colours.
# ---------------------------------------------------------------------------


def _declares_dark_scheme(sheet: Stylesheet, root: Node) -> bool:
    """Whether the document opts into a dark colour scheme.

    This decides whether CSS's initial ``canvastext`` may be read as black. A
    document that says nothing renders in the light scheme, where it is; one
    that asks for ``color-scheme: dark`` renders ``canvastext`` white, and an
    undeclared colour is then unknown rather than black.
    """
    for tag in ("html", "body", ":root"):
        entry = sheet.element_property_for(tag, "color-scheme")
        if entry is not None:
            values = [entry.value] + [c.value for c in entry.conditional]
            if any(v and "dark" in v.lower() for v in values):
                return True
    for node in root.iter():
        if node.tag == "meta" and (node.attr("name") or "").strip().lower() == "color-scheme":
            if "dark" in (node.attr("content") or "").lower():
                return True
        style = (node.attr("style") or "").lower()
        if "color-scheme" in style and "dark" in style:
            return True
    return False


def _declared_color(sheet: Stylesheet, node: Node, scheme: str) -> tuple:
    """``(Rgba|None, reason)`` — the colour in force, or why it is unknown.

    ``("", "no-declared-color")`` is *not* an error here: it means the element
    takes the initial colour, which the caller resolves against the other side.
    """
    color, reason = contrast._resolve_foreground(sheet, node, scheme)
    return (color, reason)


def _initial_text_color(dark_scheme_declared: bool) -> Optional[Rgba]:
    return None if dark_scheme_declared else INITIAL_TEXT_COLOR


def evaluate_link(
    sheet: Stylesheet,
    link: Node,
    block: Node,
    surrounding: list,
    scheme: str = LIGHT,
    dark_scheme_declared: bool = False,
) -> LinkResult:
    """Decide 1.4.1 for one link under one colour scheme."""
    decorated = _decorated(sheet, link, scheme)
    if decorated is None:
        return _undecidable("unresolvable-decoration")
    if decorated:
        return LinkResult(verdict=PASS, distinguisher="text-decoration")

    mark = _distinguisher(sheet, link, block, scheme)
    if mark:
        return LinkResult(verdict=PASS, distinguisher=mark)

    link_color, link_reason = _declared_color(sheet, link, scheme)
    owners = [owner for owner, _ in surrounding]
    text_colors = []
    for owner in owners:
        color, reason = _declared_color(sheet, owner, scheme)
        if color is None and reason != "no-declared-color":
            return _undecidable("unresolvable-surrounding-color")
        text_colors.append(color)

    # Neither side declares anything: both take the same initial colour,
    # whatever it is, so the ratio is 1.0 and nothing has to be assumed.
    undeclared_link = link_color is None and link_reason == "no-declared-color"
    if undeclared_link and all(color is None for color in text_colors):
        return LinkResult(verdict=FAIL, ratio=1.0)

    if link_color is None:
        if link_reason != "no-declared-color":
            return _undecidable("unresolvable-link-color")
        fallback = _initial_text_color(dark_scheme_declared)
        if fallback is None:
            return _undecidable("unknown-color-scheme")
        link_color = fallback
    resolved_text = []
    for color in text_colors:
        if color is None:
            fallback = _initial_text_color(dark_scheme_declared)
            if fallback is None:
                return _undecidable("unknown-color-scheme")
            color = fallback
        resolved_text.append(color)
    if not resolved_text:
        return _undecidable("unresolvable-surrounding-color")

    if not link_color.opaque or any(not color.opaque for color in resolved_text):
        # A translucent colour is the composite of itself and whatever is
        # behind it, which is 1.4.3's problem and not solved here.
        return _undecidable("translucent-text")

    # The link has to be indistinguishable from *every* colour of prose around
    # it before this is a barrier: prose it stands out from is prose a reader
    # can use to find it.
    best = max(contrast_ratio(link_color, color) for color in resolved_text)
    worst_partner = max(resolved_text, key=lambda c: contrast_ratio(link_color, c))
    common = {
        "ratio": round(best, 3),
        "link_color": link_color.hex(),
        "text_color": worst_partner.hex(),
    }
    if best >= LINK_TEXT_RATIO:
        return LinkResult(verdict=PASS, **common)
    return LinkResult(verdict=FAIL, **common)


def worst_of(results: list) -> LinkResult:
    """Combine one link's verdicts across colour schemes.

    Same rule :func:`wcag_triage.contrast.worst_of` follows, and for the same
    reason: a page delivered in two colour schemes owes the criterion in both,
    and a link that is bare prose in dark mode is a barrier however it looks in
    light mode.
    """
    if not results:
        return _undecidable("unresolvable-link-color")
    failures = [r for r in results if r.verdict == FAIL]
    if failures:
        return min(failures, key=lambda r: (r.ratio if r.ratio is not None else 1.0))
    unknown = [r for r in results if r.verdict == UNDECIDABLE]
    if unknown:
        return unknown[0]
    return results[0]


def evaluate_document(
    root: Node, base_sheet: Optional[Stylesheet] = None, schemes: tuple = SCHEMES
) -> list:
    """``[(Node, LinkResult), ...]`` for every link that sits inside prose."""
    sheet = contrast.stylesheet_for(root, base_sheet)
    dark = _declares_dark_scheme(sheet, root)
    out = []
    for link, block, surrounding in links_in_text(root, sheet):
        out.append(
            (
                link,
                worst_of(
                    [
                        evaluate_link(sheet, link, block, surrounding, scheme, dark)
                        for scheme in schemes
                    ]
                ),
            )
        )
    return out


def tally(results: list) -> dict:
    """Summarise per-link verdicts for the evidence record."""
    counts = {"pass": 0, "fail": 0, "undecidable": 0, "reasons": {}}
    for _, result in results:
        counts[result.verdict] += 1
        if result.verdict == UNDECIDABLE:
            counts["reasons"][result.reason] = counts["reasons"].get(result.reason, 0) + 1
    decided = counts["pass"] + counts["fail"]
    total = decided + counts["undecidable"]
    counts["links"] = total
    counts["decidable_share"] = round(decided / total, 4) if total else None
    return counts
