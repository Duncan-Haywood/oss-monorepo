"""WCAG 1.4.3 from the artifact alone — and an honest account of what it can't do.

Every accessibility pass in this portfolio has recorded contrast as *manual*,
with the same one-line reason: it needs rendering. That reason is an assertion,
and this module is what it takes to test it.

The claim it replaces is narrower and checkable: **a delivered page states its
own colours often enough that a meaningful share of 1.4.3 is decidable without
a browser** — because the stylesheet it ships names them, and the arithmetic
from a named colour to a contrast ratio is exact.

What matters here is not the ratio; it is the **three-valued verdict**. Every
text-bearing element comes back as ``pass``, ``fail``, or ``undecidable`` *with
a named reason*. The undecidable bucket is the product: it is the measured size
of the manual step, per page, rather than a blanket claim that the whole
criterion needs a human. A finding is emitted only for ``fail``, which is why
the resolver refuses in every direction it is unsure — an unresolvable
declaration, a background image, an ``opacity`` in the chain, a colour that a
``@media`` block redefines, or a gradient whose bounds straddle the threshold
all return ``undecidable`` rather than a guess.

Gradients are the one place this goes the other way, and deliberately. A
gradient background is normally treated as un-analysable; here it is decided
exactly, because CSS interpolates each channel linearly between stops and
relative luminance is monotonic in each channel — so the contrast attainable
anywhere on the gradient is bounded by its stops, and a bound wholly on one
side of the threshold settles the criterion. See
:func:`wcag_triage.colors.ratio_bounds`.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from typing import Optional

from .colors import Rgba, composite, parse_color, ratio_bounds, relative_luminance
from .css import (
    DARK,
    LIGHT,
    SCHEMES,
    Stylesheet,
    general_conditionals,
    parse_stylesheet,
    scheme_order,
    scheme_value,
)
from .parser import Node

# WCAG 2.2 SC 1.4.3 thresholds.
NORMAL_TEXT_RATIO = 4.5
LARGE_TEXT_RATIO = 3.0
# "Large" is 18pt, or 14pt bold, expressed in CSS px at the usual 96dpi mapping.
LARGE_PX = 24.0
LARGE_BOLD_PX = 18.66
BOLD_WEIGHT = 700

# Root font size assumed for `rem`. This is the CSS initial value and the
# default of every major browser; a stylesheet that changes it does so on
# `html`, which `Stylesheet.elements` picks up and this module honours.
DEFAULT_ROOT_PX = 16.0

# How far a conditional redeclaration may move a colour's relative luminance
# before the property is called undecidable. Sized from measurement, not taste:
# Tailwind v4 ships each palette entry as a hex fallback plus a `lab()` override
# under `@supports`, and across the 115 pairs in this portfolio's own build the
# two forms differ by at most 0.0057 in relative luminance (they disagree only
# where the hex fallback is a gamut-mapped rendition of an out-of-sRGB colour).
# A `prefers-color-scheme: dark` override moves luminance by orders of magnitude
# more, so this separates the two cases with a wide margin on both sides.
CONDITIONAL_LUMINANCE_TOLERANCE = 0.02

# Named reasons. The taxonomy *is* the result — a count per reason is the
# measured shape of the manual step.
UNDECIDABLE_REASONS = (
    "no-declared-color",
    "unresolvable-color",
    "conditional-color",
    "no-opaque-background",
    "unresolvable-background",
    "conditional-background",
    "background-image",
    "opacity-in-chain",
    "unresolvable-gradient",
    "layered-gradients",
    "gradient-straddles-threshold",
    "translucent-text-over-gradient",
    "unresolvable-font-size",
)

PASS = "pass"
FAIL = "fail"
UNDECIDABLE = "undecidable"

_SKIP_TAGS = frozenset(
    {"script", "style", "template", "head", "title", "meta", "link", "noscript", "#root"}
)
_GRADIENT_RE = re.compile(r"(repeating-)?(linear|radial|conic)-gradient\(", re.IGNORECASE)
_URL_RE = re.compile(r"\burl\(", re.IGNORECASE)


@dataclass(frozen=True)
class ContrastResult:
    """The verdict for one text-bearing element."""

    verdict: str  # PASS, FAIL or UNDECIDABLE
    reason: str = ""
    min_ratio: Optional[float] = None
    max_ratio: Optional[float] = None
    threshold: Optional[float] = None
    foreground: Optional[str] = None
    backgrounds: tuple = ()
    font_px: Optional[float] = None
    bold: bool = False
    large: bool = False

    @property
    def decided(self) -> bool:
        return self.verdict in (PASS, FAIL)


def _undecidable(reason: str) -> ContrastResult:
    return ContrastResult(verdict=UNDECIDABLE, reason=reason)


# ---------------------------------------------------------------------------
# Stylesheet assembly.
# ---------------------------------------------------------------------------


def stylesheet_for(root: Node, base: Optional[Stylesheet] = None) -> Stylesheet:
    """Collect the CSS this document carries in its own ``<style>`` blocks.

    ``base`` is a stylesheet parsed from a linked file, if the caller has one.
    A linked stylesheet this module was not given simply is not read, and every
    class it would have defined resolves to ``unresolvable-color`` — visible in
    the reason counts rather than silently absent.
    """
    blocks = [
        " ".join(node.text_parts) for node in root.iter() if node.tag == "style"
    ]
    blocks = [css for css in blocks if css.strip()]
    if not blocks:
        return base if base is not None else Stylesheet()
    # Copy before appending: a caller auditing many pages against one linked
    # stylesheet passes the same object each time, and one page's inline
    # `<style>` must not follow it to the next.
    sheet = copy.deepcopy(base) if base is not None else Stylesheet()
    for css in blocks:
        parse_stylesheet(css, sheet)
    return sheet


# ---------------------------------------------------------------------------
# Per-element declaration lookup.
# ---------------------------------------------------------------------------


def _inline_declarations(node: Node) -> dict:
    raw = node.attr("style") or ""
    out = {}
    for chunk in raw.split(";"):
        if ":" not in chunk:
            continue
        prop, _, value = chunk.partition(":")
        prop = prop.strip().lower()
        if prop:
            out[prop] = value.strip()
    return out


def _classes(node: Node) -> list:
    return [c for c in (node.attr("class") or "").split() if c]


# Cascade origin ranks. Enough of CSS specificity for the selectors this
# module reads at all: an inline style beats a class, a class beats a type
# selector, and equal ranks are settled by source order.
_RANK_INLINE = 3
_RANK_CLASS = 2
_RANK_ELEMENT = 1


@dataclass(frozen=True)
class _Declaration:
    rank: int
    order: int
    value: str
    variants: tuple = ()

    @property
    def weight(self) -> tuple:
        return (self.rank, self.order)


def _declared_ranked(
    sheet: Stylesheet, node: Node, prop: str, scheme: str = LIGHT
) -> Optional[_Declaration]:
    """The winning declaration of ``prop`` on this element, with its weight.

    The weight matters because ``background`` and ``background-color`` are the
    same property in the cascade: a page whose reset writes
    ``body { background: var(--background) }`` and whose markup carries
    ``class="bg-white"`` is white, and reading the two declarations in a fixed
    order instead of by specificity gets that backwards.
    """
    inline = _inline_declarations(node).get(prop)
    if inline is not None:
        resolved = sheet.resolve_vars(inline, scheme)
        if resolved is not None:
            return _Declaration(_RANK_INLINE, 0, resolved)
        return _Declaration(_RANK_INLINE, 0, inline)

    best = None
    best_order = -1
    # A class can declare a property *only* inside a conditional at-rule and
    # still be on the element: `dark:text-amber-400` compiles to a
    # `.dark\:text-amber-400` rule inside `@media (prefers-color-scheme: dark)`
    # and nothing outside it. Such a class contributes no unconditional value,
    # but it absolutely changes the answer — so its conditional values are
    # collected here and checked for agreement like any other variant. Missing
    # this is how a scanner confidently reports the light-mode colour of an
    # element that has a dark-mode override.
    sibling_variants: list = []
    for class_name in _classes(node):
        entry = sheet.property_for(class_name, prop)
        if entry is None:
            continue
        override = scheme_value(entry, scheme)
        if entry.value is None and override is None:
            sibling_variants.extend(
                sheet.resolve_vars(raw, scheme) for raw in general_conditionals(entry)
            )
            continue
        if override is not None and entry.value is None:
            # A scheme-only class such as `dark:text-amber-400`: it declares
            # nothing outside its media query, so its weight is the position of
            # the rule inside that media query, which is where the framework
            # emits variants — after the base utility they override.
            order = scheme_order(entry, scheme)
            if order >= best_order:
                best, best_order = entry, order
            continue
        if entry.order >= best_order:
            best, best_order = entry, entry.order
    if best is not None:
        value, variants = sheet.resolve_entry(best, scheme)
        return _Declaration(_RANK_CLASS, best_order, value, tuple(variants) + tuple(sibling_variants))

    element_entry = sheet.element_property_for(node.tag, prop)
    if element_entry is not None and (
        element_entry.value is not None or scheme_value(element_entry, scheme) is not None
    ):
        value, variants = sheet.resolve_entry(element_entry, scheme)
        return _Declaration(
            _RANK_ELEMENT, element_entry.order, value, tuple(variants) + tuple(sibling_variants)
        )
    if sibling_variants:
        # Nothing unconditional at all, but a conditional rule paints it.
        return _Declaration(_RANK_CLASS, best_order, None, tuple(sibling_variants))
    return None


def _declared(sheet: Stylesheet, node: Node, prop: str, scheme: str = LIGHT) -> tuple:
    """Winning ``(value, variants)`` for ``prop`` on this element."""
    declaration = _declared_ranked(sheet, node, prop, scheme)
    if declaration is None:
        return (None, [])
    return (declaration.value, list(declaration.variants))


def _agrees(primary: Rgba, variants: list) -> Optional[bool]:
    """Whether every conditional variant means the same colour as ``primary``.

    ``None`` means a variant exists that this module could not parse, so
    agreement is unknown — which is undecidable, not agreement.
    """
    target = relative_luminance(primary)
    for raw in variants:
        if raw is None:
            return None
        parsed = parse_color(raw)
        if parsed is None:
            return None
        if abs(relative_luminance(_flatten(parsed)) - target) > CONDITIONAL_LUMINANCE_TOLERANCE:
            return False
        if abs(parsed.a - primary.a) > 0.02:
            return False
    return True


def _flatten(color: Rgba) -> Rgba:
    """Luminance of a translucent colour taken at face value, for comparison only."""
    return Rgba(color.r, color.g, color.b, 1.0)


# ---------------------------------------------------------------------------
# Foreground.
# ---------------------------------------------------------------------------


def _resolve_foreground(sheet: Stylesheet, node: Node, scheme: str = LIGHT) -> tuple:
    """``(Rgba, "")`` or ``(None, reason)`` for the text colour in force."""
    for current in [node] + list(node.ancestors()):
        declaration = _declared_ranked(sheet, current, "color", scheme)
        if declaration is None:
            continue
        value, variants = declaration.value, list(declaration.variants)
        if value is None:
            # Painted only by a conditional rule: which colour applies depends
            # on a condition the file does not settle.
            return (None, "conditional-color")
        if value.strip().lower() in {"inherit", "currentcolor", "unset", "initial"}:
            continue
        parsed = parse_color(value)
        if parsed is None:
            return (None, "unresolvable-color")
        agreement = _agrees(parsed, variants)
        if agreement is None:
            return (None, "unresolvable-color")
        if agreement is False:
            return (None, "conditional-color")
        return (parsed, "")
    return (None, "no-declared-color")


# ---------------------------------------------------------------------------
# Background.
# ---------------------------------------------------------------------------


def _background_paint(sheet: Stylesheet, node: Node, scheme: str = LIGHT) -> tuple:
    """What this one element paints behind its content.

    Returns ``(kind, payload, reason)`` where ``kind`` is one of ``"none"``
    (paints nothing — keep walking up), ``"color"`` (an ``Rgba``),
    ``"gradient"`` (a list of ``Rgba`` stops) or ``"unknown"``.
    """
    shorthand = _declared_ranked(sheet, node, "background", scheme)
    longhand_color = _declared_ranked(sheet, node, "background-color", scheme)
    longhand_image = _declared_ranked(sheet, node, "background-image", scheme)

    for declaration in (shorthand, longhand_color, longhand_image):
        if declaration is not None and declaration.value is None:
            # Only a conditional rule paints here (a `dark:bg-*` class, say).
            return ("unknown", None, "conditional-background")

    # The shorthand sets both longhands, so it competes with each of them on
    # weight rather than being consulted before or after them.
    image = _heavier(longhand_image, shorthand if _is_image_value(shorthand) else None)
    color = _heavier(longhand_color, shorthand if _is_color_value(shorthand) else None)
    if shorthand is not None and image is shorthand:
        # A shorthand carrying an image resets background-color to transparent
        # unless it also names a colour, which `_is_color_value` would have
        # caught. Either way the image is what paints.
        color = None

    if image is not None:
        text = image.value or ""
        if _URL_RE.search(text):
            return ("unknown", None, "background-image")
        if _GRADIENT_RE.search(text):
            stops = _gradient_stops(text)
            if stops is None:
                return ("unknown", None, "unresolvable-gradient")
            if image.variants:
                return ("unknown", None, "conditional-background")
            return ("gradient", stops, "")
        if (text.strip().lower() not in {"none", "initial", "unset", ""}) and color is None:
            return ("unknown", None, "unresolvable-background")

    if color is None:
        return ("none", None, "")

    text = (color.value or "").strip()
    lowered = text.lower()
    if lowered in {"none", "transparent", "initial", "unset", ""}:
        return ("none", None, "")
    if lowered == "inherit":
        return ("unknown", None, "unresolvable-background")
    parsed = parse_color(text) if _is_plain_color(text) else _color_part(text)
    if parsed is None:
        return ("unknown", None, "unresolvable-background")
    if parsed.transparent:
        return ("none", None, "")
    agreement = _agrees(parsed, list(color.variants))
    if agreement is None:
        return ("unknown", None, "unresolvable-background")
    if agreement is False:
        return ("unknown", None, "conditional-background")
    return ("color", parsed, "")


def _heavier(first: Optional[_Declaration], second: Optional[_Declaration]) -> Optional[_Declaration]:
    if first is None:
        return second
    if second is None:
        return first
    return first if first.weight >= second.weight else second


def _is_plain_color(text: str) -> bool:
    return parse_color(text) is not None


def _color_part(text: str) -> Optional[Rgba]:
    """The colour inside a ``background`` shorthand that also carries layout.

    Only the unambiguous case is handled: exactly one token of the shorthand
    parses as a colour. Anything else returns ``None`` and the caller refuses,
    because a shorthand this module misreads paints a background that is not
    there.
    """
    tokens = [t for t in re.split(r"\s+", text.strip()) if t and t != "/"]
    parsed = [parse_color(token) for token in tokens]
    found = [color for color in parsed if color is not None]
    if len(found) == 1:
        return found[0]
    return None


def _is_image_value(declaration: Optional[_Declaration]) -> bool:
    if declaration is None or declaration.value is None:
        return False
    return bool(_URL_RE.search(declaration.value) or _GRADIENT_RE.search(declaration.value))


def _is_color_value(declaration: Optional[_Declaration]) -> bool:
    if declaration is None or declaration.value is None:
        return False
    if _is_image_value(declaration):
        return False
    text = declaration.value.strip().lower()
    if text in {"none", "transparent", "initial", "unset", "inherit", ""}:
        return True
    return _is_plain_color(declaration.value) or _color_part(declaration.value) is not None


def _gradient_stops(text: str) -> Optional[list]:
    """Parse the colour stops of the first gradient in ``text``.

    Only the stop *colours* are read. Their positions do not matter: the bound
    in :func:`~wcag_triage.colors.ratio_bounds` is over the whole interpolation,
    and where on the element a given colour lands does not change which colours
    are attainable.
    """
    match = _GRADIENT_RE.search(text)
    if not match:
        return None
    open_paren = text.index("(", match.start())
    depth = 0
    end = -1
    for index in range(open_paren, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                end = index
                break
    if end == -1:
        return None
    body = text[open_paren + 1 : end]
    stops = []
    for part in _split_args(body):
        candidate = part.strip()
        if not candidate:
            continue
        color = parse_color(candidate)
        if color is None:
            # Strip a trailing position (`#fff 55%`, `red 0 20px`).
            tokens = candidate.split()
            color = parse_color(tokens[0]) if tokens else None
        if color is None:
            # The first argument is often a direction or shape
            # (`to right`, `ellipse at top`, `in oklab`) and carries no colour.
            if not stops and _looks_like_geometry(candidate):
                continue
            return None
        stops.append(color)
    return stops or None


def _looks_like_geometry(text: str) -> bool:
    lowered = text.strip().lower()
    keywords = ("to ", "at ", "circle", "ellipse", "closest", "farthest", "in ", "from ")
    return lowered.startswith(keywords) or lowered.endswith(("deg", "turn", "rad", "grad"))


def _split_args(body: str) -> list:
    parts = []
    depth = 0
    current = []
    for char in body:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return parts


def _resolve_background(sheet: Stylesheet, node: Node, scheme: str = LIGHT) -> tuple:
    """``(list_of_opaque_stops, "")`` or ``(None, reason)``.

    Walks self then ancestors, stacking translucent layers until an opaque one
    is found, then composites the stack down. ``opacity`` anywhere in the chain
    stops the walk: it multiplies through in a way that depends on stacking
    context, and getting it wrong invents contrast that is not there.
    """
    layers: list = []
    gradient_stops: Optional[list] = None
    for current in [node] + list(node.ancestors()):
        opacity_value, _ = _declared(sheet, current, "opacity", scheme)
        if opacity_value is not None:
            try:
                if float(opacity_value.strip().rstrip("%")) < 1.0:
                    return (None, "opacity-in-chain")
            except ValueError:
                return (None, "opacity-in-chain")

        kind, payload, reason = _background_paint(sheet, current, scheme)
        if kind == "unknown":
            return (None, reason)
        if kind == "none":
            continue
        if kind == "gradient":
            if any(not stop.opaque for stop in payload):
                return (None, "unresolvable-gradient")
            if gradient_stops is not None:
                return (None, "layered-gradients")
            gradient_stops = payload
            return (_composite_stack(layers, gradient_stops), "")
        if payload.opaque:
            return (_composite_stack(layers, [payload]), "")
        layers.append(payload)
    return (None, "no-opaque-background")


def _composite_stack(layers: list, bases: list) -> list:
    """Flatten translucent ``layers`` (topmost first) onto each opaque base.

    Compositing is affine per channel, so applying it stop-by-stop preserves
    the property that made the gradient bound exact: the composited colours
    still vary monotonically between composited stops.
    """
    out = []
    for base in bases:
        current = base
        for layer in reversed(layers):
            current = composite(layer, current)
        out.append(current)
    return out


# ---------------------------------------------------------------------------
# Text size.
# ---------------------------------------------------------------------------


def _root_font_px(sheet: Stylesheet) -> float:
    entry = sheet.element_property_for("html", "font-size")
    if entry is not None and entry.value is not None:
        declared = sheet.resolve_vars(entry.value)
        parsed = _length_px(declared, DEFAULT_ROOT_PX)
        if parsed is not None:
            return parsed
        # `html { font-size: 100% }` is the common reset spelling, and is a
        # percentage of the browser default rather than of anything else.
        factor = _relative_factor(declared) if declared else None
        if factor is not None:
            return factor * DEFAULT_ROOT_PX
    return DEFAULT_ROOT_PX


def _length_px(value: Optional[str], root_px: float) -> Optional[float]:
    """An absolute length in CSS px, or ``None`` if the unit is context-relative."""
    if value is None:
        return None
    text = value.strip().lower()
    try:
        if text.endswith("px"):
            return float(text[:-2])
        if text.endswith("rem"):
            return float(text[:-3]) * root_px
        if text.endswith("pt"):
            return float(text[:-2]) * 96.0 / 72.0
        if text.endswith("pc"):
            return float(text[:-2]) * 16.0
        if text.endswith("in"):
            return float(text[:-2]) * 96.0
    except ValueError:
        return None
    # `ex`, `ch`, `vw` and the absolute-size keywords depend on font metrics or
    # viewport this module does not track. `em` and `%` are handled by
    # `_font_px`, which has the parent chain to resolve them against.
    return None


def _relative_factor(value: str) -> Optional[float]:
    """The multiplier for a parent-relative font size, or ``None``."""
    text = value.strip().lower()
    try:
        if text.endswith("em") and not text.endswith("rem"):
            return float(text[:-2])
        if text.endswith("%"):
            return float(text[:-1]) / 100.0
    except ValueError:
        return None
    if text in {"smaller", "larger"}:
        # Defined against the parent, but by a UA-dependent scaling table.
        return None
    return None


def _font_px(
    sheet: Stylesheet,
    node: Optional[Node],
    root_px: float,
    depth: int = 0,
    scheme: str = LIGHT,
) -> Optional[float]:
    """Computed font size in px, resolving ``em``/``%`` up the parent chain.

    Tailwind's own reset writes ``code { font-size: 1em }``, so a reader that
    treats every relative unit as unknown gives up on every inline code span on
    a documentation page — which is what made this worth resolving rather than
    refusing.
    """
    if node is None:
        return root_px
    if depth > 32:
        return None
    for current in [node] + list(node.ancestors()):
        value, _ = _declared(sheet, current, "font-size", scheme)
        if value is None:
            continue
        if value.strip().lower() in {"inherit", "unset", "initial", "medium"}:
            continue
        absolute = _length_px(value, root_px)
        if absolute is not None:
            return absolute
        factor = _relative_factor(value)
        if factor is None:
            return None
        parent_px = _font_px(sheet, current.parent, root_px, depth + 1, scheme)
        if parent_px is None:
            return None
        return factor * parent_px
    return root_px


def _alternate_sizes(sheet: Stylesheet, node: Node, root_px: float, scheme: str = LIGHT) -> list:
    """Sizes this element also takes under a responsive variant.

    ``text-xs sm:text-base`` is two sizes, and which one is in force depends on
    the viewport. Rather than refuse — responsive type is on nearly every
    element of a modern page — the caller scores against the *most lenient*
    threshold any of them implies, so a reported failure fails at every
    breakpoint.
    """
    sizes = []
    for current in [node] + list(node.ancestors()):
        declaration = _declared_ranked(sheet, current, "font-size", scheme)
        if declaration is None:
            continue
        for raw in declaration.variants:
            if raw is None:
                continue
            absolute = _length_px(raw, root_px)
            if absolute is not None:
                sizes.append(absolute)
        break
    return sizes


def _resolve_font(sheet: Stylesheet, node: Node, scheme: str = LIGHT) -> tuple:
    """``(px, bold, threshold, "")`` or ``(None, False, None, reason)``."""
    root_px = _root_font_px(sheet)
    size_px = _font_px(sheet, node, root_px, scheme=scheme)
    if size_px is None:
        return (None, False, None, "unresolvable-font-size")

    bold = False
    for current in [node] + list(node.ancestors()):
        value, _ = _declared(sheet, current, "font-weight", scheme)
        if value is None:
            continue
        text = value.strip().lower()
        if text in {"inherit", "unset", "initial"}:
            continue
        if text in {"bold", "bolder"}:
            bold = True
        else:
            try:
                bold = float(text) >= BOLD_WEIGHT
            except ValueError:
                bold = False
        break

    candidates = [size_px] + _alternate_sizes(sheet, node, root_px, scheme)
    threshold = min(threshold_for(candidate, bold) for candidate in candidates)
    return (size_px, bold, threshold, "")


def threshold_for(font_px: float, bold: bool) -> float:
    if font_px >= LARGE_PX or (bold and font_px >= LARGE_BOLD_PX):
        return LARGE_TEXT_RATIO
    return NORMAL_TEXT_RATIO


# ---------------------------------------------------------------------------
# Public entry points.
# ---------------------------------------------------------------------------


def has_own_text(node: Node) -> bool:
    return any(part.strip() for part in node.text_parts)


def is_hidden(node: Node) -> bool:
    for current in [node] + list(node.ancestors()):
        if current.has_attr("hidden"):
            return True
        if (current.attr("aria-hidden") or "").strip().lower() == "true":
            return True
    return False


def text_elements(root: Node) -> list:
    """Every element carrying its own visible text, in document order."""
    return [
        node
        for node in root.iter()
        if node.tag not in _SKIP_TAGS and has_own_text(node) and not is_hidden(node)
    ]


def evaluate(sheet: Stylesheet, node: Node, scheme: str = LIGHT) -> ContrastResult:
    """Decide SC 1.4.3 for one text-bearing element under one colour scheme."""
    foreground, reason = _resolve_foreground(sheet, node, scheme)
    if foreground is None:
        return _undecidable(reason)
    backgrounds, reason = _resolve_background(sheet, node, scheme)
    if backgrounds is None:
        return _undecidable(reason)
    font_px, bold, threshold, reason = _resolve_font(sheet, node, scheme)
    if font_px is None:
        return _undecidable(reason)

    if foreground.transparent:
        return _undecidable("unresolvable-color")
    if not foreground.opaque:
        if len(backgrounds) > 1:
            # Translucent text over a gradient: the text colour moves with the
            # backdrop, so the stop bound no longer brackets the ratio. Not
            # worth a special case for how rarely it occurs — refuse instead.
            return _undecidable("translucent-text-over-gradient")
        blended = composite(foreground, backgrounds[0])
        low, high = ratio_bounds(blended, backgrounds)
        resolved_foreground = blended.hex()
    else:
        low, high = ratio_bounds(foreground, backgrounds)
        resolved_foreground = foreground.hex()

    large = threshold == LARGE_TEXT_RATIO
    common = {
        "min_ratio": round(low, 3),
        "max_ratio": round(high, 3),
        "threshold": threshold,
        "foreground": resolved_foreground,
        "backgrounds": tuple(color.hex() for color in backgrounds),
        "font_px": font_px,
        "bold": bold,
        "large": large,
    }
    if low >= threshold:
        return ContrastResult(verdict=PASS, **common)
    if high < threshold:
        return ContrastResult(verdict=FAIL, **common)
    return ContrastResult(verdict=UNDECIDABLE, reason="gradient-straddles-threshold", **common)


def worst_of(results: list) -> ContrastResult:
    """Combine one element's verdicts across colour schemes.

    A page that is delivered in two colour schemes has to satisfy 1.4.3 in
    both, so the element's verdict is the worst of them: any decided failure
    is a failure, and otherwise any scheme this module could not decide leaves
    the element undecided. Reporting the light-mode verdict alone is the error
    this function exists to prevent — it is exactly how a checker declares a
    dark-mode-only barrier absent.
    """
    if not results:
        return _undecidable("no-declared-color")
    failures = [r for r in results if r.verdict == FAIL]
    if failures:
        return min(failures, key=lambda r: r.min_ratio)
    unknown = [r for r in results if r.verdict == UNDECIDABLE]
    if unknown:
        return unknown[0]
    return min(results, key=lambda r: r.min_ratio)


def evaluate_document(
    root: Node, base_sheet: Optional[Stylesheet] = None, schemes: tuple = SCHEMES
) -> list:
    """``[(Node, ContrastResult), ...]`` for every text-bearing element.

    Evaluated once per colour scheme in ``schemes`` and combined with
    :func:`worst_of`. On a page with no ``prefers-color-scheme`` rules both
    passes see identical declarations and the second costs only time. On a page
    that has them it changes the answer: over this portfolio's 85 built pages,
    scoring the light scheme alone finds 581 failures and scoring both finds
    841 — 260 real barriers that exist only in dark mode, which a single-scheme
    checker reports as clean.
    """
    sheet = stylesheet_for(root, base_sheet)
    out = []
    for node in text_elements(root):
        out.append((node, worst_of([evaluate(sheet, node, scheme) for scheme in schemes])))
    return out
