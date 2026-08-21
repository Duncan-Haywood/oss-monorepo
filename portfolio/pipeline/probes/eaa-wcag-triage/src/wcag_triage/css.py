"""A deliberately small CSS reader: enough to answer "what colour is this class".

This is not a CSS engine and must never grow into one. It answers one question
— *does the stylesheet the page ships state, unconditionally, what colour a
given class paints?* — and it is built to answer "no" loudly whenever the
honest answer is "it depends".

Three design choices carry all the weight:

* **Only single-class selectors.** ``.text-zinc-900`` is read; ``.card p``,
  ``.btn:hover``, ``#id``, ``[data-theme] .x`` are all skipped. Anything with a
  combinator, a pseudo, or more than one simple selector needs cascade and
  specificity reasoning this module refuses to do, and a wrong answer there is
  a false accessibility finding.
* **Conditional at-rules are tracked, not ignored.** A declaration inside
  ``@media`` / ``@supports`` / ``@container`` applies only when a condition the
  file does not settle holds. Those values are kept *separately* so the caller
  can check whether they agree with the unconditional one. ``@layer`` is not
  conditional and is transparent here.
* **Unknown is returned, never assumed.** A property this module cannot resolve
  yields ``None``.

The reason the conditional handling is not just "skip them" is concrete.
Tailwind v4 ships every palette entry twice — a hex fallback and a ``lab()``
override under ``@supports (color: lab(0% 0 0))`` — so skipping conditionals
reads the fallback and *assumes* the two agree. It also ships a
``@media (prefers-color-scheme: dark)`` block, where assuming agreement would
be flatly wrong. The same mechanism has to tell those two apart, and it can
only do that by keeping both values and comparing them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

# The only properties this module keeps. Everything else is discarded at parse
# time, which keeps the maps small and makes it obvious what the reader reads.
TRACKED_PROPERTIES = frozenset(
    {
        "color",
        "background-color",
        "background",
        "background-image",
        "font-size",
        "font-weight",
        "opacity",
    }
)

CONDITIONAL_AT_RULES = ("media", "supports", "container")

# The two colour schemes a page can be delivered in. Unlike a viewport
# breakpoint, `prefers-color-scheme` has exactly two states and the stylesheet
# spells out both, so each is decidable — see `scheme_value`.
LIGHT = "light"
DARK = "dark"
SCHEMES = (LIGHT, DARK)

_DARK_SCHEME_RE = re.compile(r"prefers-color-scheme\s*:\s*dark", re.IGNORECASE)
_LIGHT_SCHEME_RE = re.compile(r"prefers-color-scheme\s*:\s*light", re.IGNORECASE)


def scheme_of(condition: str) -> Optional[str]:
    """``LIGHT``/``DARK`` if this at-rule condition selects a colour scheme.

    Only a condition that is *solely* about the colour scheme counts. A
    condition that also carries a breakpoint (``(min-width: 40rem) and
    (prefers-color-scheme: dark)``) is left as a general condition, because
    deciding it would still need the viewport.
    """
    if _DARK_SCHEME_RE.search(condition) and not _LIGHT_SCHEME_RE.search(condition):
        return DARK if _only_scheme(condition) else None
    if _LIGHT_SCHEME_RE.search(condition):
        return LIGHT if _only_scheme(condition) else None
    return None


def _only_scheme(condition: str) -> bool:
    stripped = re.sub(r"@media|\s|\(|\)", "", condition, flags=re.IGNORECASE)
    return bool(re.fullmatch(r"prefers-color-scheme:(dark|light)", stripped, re.IGNORECASE))


def scheme_value(entry: "PropertyValue", scheme: str) -> Optional[str]:
    """The value this property takes under ``scheme``, if a rule overrides it."""
    winner = None
    for declaration in entry.conditional:
        if scheme_of(declaration.condition) == scheme:
            winner = declaration.value
    return winner


def scheme_order(entry: "PropertyValue", scheme: str) -> int:
    """Source position of the winning colour-scheme override, or -1.

    A utility that exists *only* under a colour scheme (`dark:text-amber-400`)
    has no unconditional source position at all, and reading its position as -1
    puts it behind the base utility it is written to override.
    """
    winner = -1
    for declaration in entry.conditional:
        if scheme_of(declaration.condition) == scheme:
            winner = declaration.order
    return winner


def general_conditionals(entry: "PropertyValue") -> list:
    """Conditional values whose condition is *not* just a colour scheme."""
    return [d.value for d in entry.conditional if scheme_of(d.condition) is None]

_SINGLE_CLASS_RE = re.compile(r"^\.((?:[^\s.,:>+~()\[\]#\\]|\\.)+)$")
_VAR_RE = re.compile(r"var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*(.*?))?\s*\)", re.DOTALL)


@dataclass(frozen=True)
class ConditionalValue:
    """One declaration that applied only inside a conditional at-rule."""

    condition: str
    value: str
    order: int


@dataclass
class PropertyValue:
    """What a stylesheet says about one property of one class."""

    # Last unconditional declaration, in source order. ``None`` when every
    # declaration for this property sat inside a conditional at-rule.
    value: Optional[str] = None
    # Every declaration that sat inside a conditional at-rule, in source order,
    # as ``(condition_text, value)``. The condition is kept because not all
    # conditions are equally unknowable: a viewport breakpoint really is
    # undecidable from a file, but `prefers-color-scheme` has exactly two
    # states and both are in the file, so a checker can decide each.
    conditional: list = field(default_factory=list)
    # Source position of the winning unconditional declaration. Two utility
    # classes on the same element have equal specificity, so source order is
    # what decides between them.
    order: int = -1


@dataclass
class Stylesheet:
    # class name -> property -> PropertyValue
    classes: dict = field(default_factory=dict)
    # tag name -> property -> PropertyValue, from bare type selectors. Lower
    # specificity than any class, and kept mainly because a reset stylesheet
    # sets heading sizes and weights there: without it, an <h1> carrying no
    # size class would be read as 16px and scored against the small-text
    # threshold it may not owe.
    elements: dict = field(default_factory=dict)
    # custom property -> PropertyValue, from :root / html / * selectors
    variables: dict = field(default_factory=dict)

    def property_for(self, class_name: str, prop: str) -> Optional[PropertyValue]:
        return self.classes.get(class_name, {}).get(prop)

    def element_property_for(self, tag: str, prop: str) -> Optional[PropertyValue]:
        return self.elements.get(tag, {}).get(prop)

    def resolve_vars(
        self, value: Optional[str], scheme: str = LIGHT, _depth: int = 0
    ) -> Optional[str]:
        """Expand ``var(--x)`` against custom properties, under one colour scheme.

        Returns ``None`` if a referenced variable is missing, is only defined
        under a condition other than the colour scheme, or the chain is deeper
        than a sane nesting depth.
        """
        if value is None:
            return None
        if "var(" not in value:
            return value
        if _depth > 8:
            return None

        def substitute(match) -> Optional[str]:
            name = match.group(1)
            fallback = match.group(2)
            declared = self.variables.get(name)
            if declared is not None:
                override = scheme_value(declared, scheme)
                if override is not None:
                    return override
                if declared.value is not None:
                    return declared.value
            if fallback is not None:
                return fallback
            return None

        out = []
        cursor = 0
        for match in _VAR_RE.finditer(value):
            replacement = substitute(match)
            if replacement is None:
                return None
            out.append(value[cursor : match.start()])
            out.append(replacement)
            cursor = match.end()
        out.append(value[cursor:])
        return self.resolve_vars("".join(out), scheme, _depth + 1)

    def resolve_all(self, class_name: str, prop: str, scheme: str = LIGHT) -> tuple:
        """Return ``(primary, variants)`` for one class/property.

        ``primary`` is the unconditional declaration with ``var()`` expanded
        against unconditional custom properties. ``variants`` is every *other*
        value the same property could take because a conditional at-rule
        redeclares it — either directly on the class, or on a custom property
        it references. Both are raw CSS value strings, or ``None`` where a
        reference could not be expanded.

        A caller that ignores ``variants`` is asserting that no ``@media`` or
        ``@supports`` block in the sheet touches this colour. That assertion is
        false on any Tailwind v4 build, which is why this returns both.
        """
        return self.resolve_entry(self.property_for(class_name, prop), scheme)

    def resolve_element(self, tag: str, prop: str, scheme: str = LIGHT) -> tuple:
        """``resolve_all`` for a bare type selector."""
        return self.resolve_entry(self.element_property_for(tag, prop), scheme)

    def resolve_entry(self, entry: Optional[PropertyValue], scheme: str = LIGHT) -> tuple:
        """``(primary, variants)`` for one property entry under ``scheme``.

        ``primary`` is the value in force: the colour-scheme override if the
        sheet has one for ``scheme``, otherwise the unconditional declaration.
        ``variants`` holds only the values under conditions that remain
        genuinely unknown — breakpoints, ``@supports`` — for the caller to
        check for agreement.
        """
        if entry is None:
            return (None, [])
        override = scheme_value(entry, scheme)
        source = override if override is not None else entry.value
        primary = self.resolve_vars(source, scheme)
        variants = [self.resolve_vars(raw, scheme) for raw in general_conditionals(entry)]
        base = source if source is not None else ""
        for name in _VAR_RE.findall(base):
            declared = self.variables.get(name[0])
            if declared is None:
                continue
            for alternative in general_conditionals(declared):
                swapped = base.replace(f"var({name[0]})", alternative)
                if swapped == base:
                    swapped = _VAR_RE.sub(alternative, base, count=1)
                variants.append(self.resolve_vars(swapped, scheme))
        return (primary, variants)


def unescape_selector(name: str) -> str:
    """Undo CSS identifier escaping, e.g. ``bg-white\\/90`` -> ``bg-white/90``."""
    return re.sub(r"\\(.)", r"\1", name)


_TYPE_SELECTOR_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9]*$")


def parse_stylesheet(text: str, sheet: Optional[Stylesheet] = None) -> Stylesheet:
    """Parse CSS source into a :class:`Stylesheet`.

    Pass an existing ``sheet`` to append a second source to it — a page's
    inline ``<style>`` blocks on top of its linked stylesheet, in that order.
    """
    sheet = sheet if sheet is not None else Stylesheet()
    counter = [_next_order(sheet)]
    _parse_block(_strip_comments(text), sheet, None, counter)
    return sheet


def _next_order(sheet: Stylesheet) -> int:
    highest = 0
    for bucket in list(sheet.classes.values()) + list(sheet.elements.values()):
        for entry in bucket.values():
            highest = max(highest, entry.order)
    return highest + 1


def _strip_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)


def _parse_block(text: str, sheet: Stylesheet, condition: Optional[str], counter: list) -> None:
    """Walk one level of ``prelude { body }`` / ``declaration;`` items."""
    cursor = 0
    length = len(text)
    while cursor < length:
        brace = _find_top_level(text, cursor, "{")
        semicolon = _find_top_level(text, cursor, ";")
        if brace == -1 or (semicolon != -1 and semicolon < brace):
            # A bare statement at this level (``@import ...;``,
            # ``@layer a, b;``) — nothing this reader wants.
            if semicolon == -1:
                return
            cursor = semicolon + 1
            continue
        prelude = text[cursor:brace].strip()
        end = _matching_brace(text, brace)
        if end == -1:
            return
        body = text[brace + 1 : end]
        _handle_rule(prelude, body, sheet, condition, counter)
        cursor = end + 1


def _handle_rule(
    prelude: str, body: str, sheet: Stylesheet, condition: Optional[str], counter: list
) -> None:
    if prelude.startswith("@"):
        name = prelude[1:].split()[0].split("(")[0].lower() if len(prelude) > 1 else ""
        if name in CONDITIONAL_AT_RULES:
            nested = prelude if condition is None else f"{condition} and {prelude}"
            _parse_block(body, sheet, nested, counter)
        elif name == "layer":
            # A cascade layer changes precedence, not applicability.
            _parse_block(body, sheet, condition, counter)
        # @property, @keyframes, @font-face and friends carry nothing we read.
        return

    declarations = _declarations(body)
    counter[0] += 1
    order = counter[0]
    for selector in _split_selectors(prelude):
        if selector in {":root", "html", "*", ":host"}:
            for prop, value in declarations:
                if prop.startswith("--"):
                    _record(sheet.variables, prop, value, condition, order)
        match = _SINGLE_CLASS_RE.match(selector)
        if match:
            class_name = unescape_selector(match.group(1))
            bucket = sheet.classes.setdefault(class_name, {})
            for prop, value in declarations:
                if prop in TRACKED_PROPERTIES:
                    _record(bucket, prop, value, condition, order)
            continue
        if _TYPE_SELECTOR_RE.match(selector):
            bucket = sheet.elements.setdefault(selector.lower(), {})
            for prop, value in declarations:
                if prop in TRACKED_PROPERTIES:
                    _record(bucket, prop, value, condition, order)


def _record(
    bucket: dict, prop: str, value: str, condition: Optional[str], order: int
) -> None:
    entry = bucket.setdefault(prop, PropertyValue())
    if condition is not None:
        entry.conditional.append(ConditionalValue(condition, value, order))
    else:
        entry.value = value
        entry.order = order


def _declarations(body: str) -> list:
    """Split a rule body into ``(property, value)`` pairs, skipping nested rules."""
    out = []
    cursor = 0
    length = len(body)
    while cursor < length:
        brace = _find_top_level(body, cursor, "{")
        semicolon = _find_top_level(body, cursor, ";")
        if brace != -1 and (semicolon == -1 or brace < semicolon):
            # A nested rule (``&:hover { ... }``). Nested selectors need
            # cascade reasoning this reader refuses; skip the whole block.
            end = _matching_brace(body, brace)
            if end == -1:
                break
            cursor = end + 1
            continue
        chunk = body[cursor:] if semicolon == -1 else body[cursor:semicolon]
        cursor = length if semicolon == -1 else semicolon + 1
        colon = _find_top_level(chunk, 0, ":")
        if colon == -1:
            continue
        prop = chunk[:colon].strip().lower()
        value = chunk[colon + 1 :].strip()
        if prop and value:
            out.append((prop, value))
    return out


def _split_selectors(prelude: str) -> list:
    return [s.strip() for s in prelude.split(",") if s.strip()]


def _find_top_level(text: str, start: int, char: str) -> int:
    """Index of ``char`` at parenthesis/bracket depth zero, or -1."""
    depth = 0
    index = start
    length = len(text)
    while index < length:
        current = text[index]
        if current == "\\":
            index += 2
            continue
        if current in "([":
            depth += 1
        elif current in ")]":
            depth -= 1
        elif current in "\"'":
            index = _skip_string(text, index)
            continue
        elif current == char and depth == 0:
            return index
        index += 1
    return -1


def _skip_string(text: str, index: int) -> int:
    quote = text[index]
    index += 1
    while index < len(text):
        if text[index] == "\\":
            index += 2
            continue
        if text[index] == quote:
            return index + 1
        index += 1
    return index


def _matching_brace(text: str, open_index: int) -> int:
    depth = 0
    index = open_index
    length = len(text)
    while index < length:
        current = text[index]
        if current == "\\":
            index += 2
            continue
        if current in "\"'":
            index = _skip_string(text, index)
            continue
        if current == "{":
            depth += 1
        elif current == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return -1
