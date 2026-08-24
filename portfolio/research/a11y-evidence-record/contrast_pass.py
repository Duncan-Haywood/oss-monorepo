#!/usr/bin/env python3
"""Port of SC 1.4.3 (colour contrast) from the sibling engine, adapted for templates.

`portfolio/pipeline/probes/eaa-wcag-triage/` (PR #523) tested the same claim —
"1.4.3 needs rendering, and is therefore manual" — against *rendered* pages and
found it 98.76% decidable, because a rendered page's own stylesheet names its
colours. That engine's resolver (`wcag_triage.colors`/`css`/`contrast`) is
reused here rather than reimplemented: its colour arithmetic is verified
against published WCAG ratios and against a 115-pair CIELAB fixture from a
real Tailwind v4 build, and duplicating that would duplicate the risk of
getting it subtly wrong a second time. See `../a11y-engine-agreement/` for the
established pattern of importing the sibling package via `sys.path`.

What is different here, and why this could not just be a straight port
------------------------------------------------------------------------
`audit.py` reads *unrendered* storefront theme *templates* — Liquid, Twig,
Blade, EJS, Vue, Svelte — not the rendered HTML/CSS pairs #523 measured. Three
things follow from that:

1. **The stylesheet is not necessarily inline.** A rendered page carries its
   CSS in `<style>` blocks or the caller supplies the one file it was built
   from; a theme package may ship its CSS as a separate file entirely, linked
   by an asset-pipeline tag (`{{ 'theme.css' | asset_url }}`) this pass cannot
   resolve without knowing that pipeline. `stylesheet_for()` (reused from
   the sibling engine, unmodified) still picks up whatever `<style>` blocks
   the *same* file carries — the Vue/Svelte single-file-component case — and
   a caller can pass in whatever external CSS it does have via
   `audit_source(..., stylesheet=...)`. What it cannot do is guess which
   stylesheet in a multi-file package belongs to which template; that
   association is left to the caller (`measure_themes.py` merges every `.css`
   file in a package's tarball, `audit.py --stylesheet PATH` merges what it is
   given), and is stated as a limitation rather than solved by guessing.

2. **`class` and `style` are template output, not fixed text.** A rendered
   page's `class="text-zinc-500"` is a fact; a template's
   `class="{{ 'text-zinc-500' if error }}"` is a question the file does not
   answer. Reading that value at all, undecidable-marked-token and all, into
   the sibling engine's class-name matcher would either resolve nothing (the
   token matches no real CSS class — safe, just an extra false-undecidable)
   or — the case worth guarding — leave an *ancestor's* colour or background
   from an earlier, differently-classed rendering of the DOM standing in for
   the one this element will actually get. This module refuses that: an
   element under any dynamically-classed or dynamically-styled ancestor
   (self included) is reported straight as undecidable, before the cascade
   resolver is asked to reason about it at all. See `_dynamic_guard_reason`.

3. **SC 1.3.4 is the same adapter, not a second CSS reader.** The sibling
   already decides orientation locks from bare ``html``/``body`` type
   selectors under a pure ``(orientation: …)`` query. This module reuses
   that decision (``orientation_conditionals`` plus ``_has_visual_rotation``)
   and adds only the template refusal: a ``transform`` value that is itself
   an expression is undecidable, never a guessed lock. Class-selector locks
   stay out of scope for the same reason they are out of scope in the
   sibling — attributing a class to "the whole page" needs cascade
   reasoning this reader does not do.

`is_expr`/`node.attr()`'s framework-binding-prefix resolution
(`:class`, `v-bind:class`, `[class]`, ...) already normalise Vue/Angular
binding syntax to the plain attribute name; `is_expr` only catches
delimiter-wrapped template syntax (`{{ }}`, `{% %}`, PHP, EJS/ERB), so a raw
JS binding expression such as `:class="isActive ? 'text-red-500' : ''"`
passes through un-flagged. That is not a correctness gap: none of its tokens
(`isActive`, `?`, `'text-red-500'`, ...) match a real CSS class name, so the
cascade resolver finds nothing and reports `no-declared-color` — still
undecidable, just for a more literal reason than "this was dynamic". It does
mean a *static* Vue binding (`:class="'always-red'"`) is missed and reported
undecidable rather than resolved; that is under-reporting, the direction
`audit.py`'s whole design accepts.

Standard library only, beyond the `sys.path` import of the sibling probe.
"""

from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
PROBE_SRC = HERE.parents[1] / "pipeline/probes/eaa-wcag-triage/src"
if str(PROBE_SRC) not in sys.path:
    sys.path.insert(0, str(PROBE_SRC))

from wcag_triage import css as wt_css  # noqa: E402
from wcag_triage import contrast as wt_contrast  # noqa: E402
from wcag_triage import usecolor as wt_usecolor  # noqa: E402
from wcag_triage.rules import _has_visual_rotation  # noqa: E402

import audit  # noqa: E402

CHECK = "text-contrast-fail"
USE_OF_COLOR_CHECK = "color-only-link"
ORIENTATION_CHECK = "orientation-lock"

# Reported straight as undecidable, before the cascade resolver runs at all.
# See the module docstring, point 2.
DYNAMIC_CLASS = "class-is-template-expression"
DYNAMIC_STYLE = "style-is-template-expression"

# A node tag that never carries the page's real content and should not be
# scored even though `Tree` can attach loose top-level text to it (a bare
# `audit_source("hello")` with no enclosing tag attaches "hello" to the
# document root). Named separately from `wt_contrast._SKIP_TAGS`, which does
# not know this parser's root tag.
_ROOT_TAG = "#document"


def stylesheet_for(root: "audit.Node", base=None) -> "wt_css.Stylesheet":
    """The stylesheet in force for one template: its own `<style>` blocks,
    layered on top of `base` (an external stylesheet the caller supplied).

    Delegates entirely to the sibling engine's own function — `root` only
    needs `.iter()` and `.tag`/`.text_parts`, which `audit.Node` now has.
    """
    return wt_contrast.stylesheet_for(root, base)


def merge_stylesheets(css_sources) -> "wt_css.Stylesheet":
    """One `Stylesheet` from however many external CSS file contents.

    Merging every stylesheet a caller hands in is deliberately what it does
    and no more: which file belongs to which template, across a package with
    more than one, is not decided here. See the module docstring.
    """
    sheet = wt_css.Stylesheet()
    for css_text in css_sources:
        wt_css.parse_stylesheet(css_text, sheet)
    return sheet


def _dynamic_guard_reason(node: "audit.Node") -> "str | None":
    """`None` if `node` and every ancestor has literal `class`/`style`.

    Checked up the whole ancestor chain, not just on `node` itself: a wrapper
    `<div class="{{ x }}">` can add a `dark:` or colour-bearing class the
    template decides at render time, and that changes this element's answer
    even though this element's own attributes are perfectly literal.
    """
    for current in [node] + list(node.ancestors()):
        if audit.is_expr(current.attr("class")):
            return DYNAMIC_CLASS
        if audit.is_expr(current.attr("style")):
            return DYNAMIC_STYLE
    return None


def evaluate_template_contrast(root: "audit.Node", sheet: "wt_css.Stylesheet") -> list:
    """`[(node, ContrastResult), ...]` for every text-bearing element `audit.py`
    should score, screened by the dynamic-class/style guard above.
    """
    out = []
    for node in wt_contrast.text_elements(root):
        if node.tag == _ROOT_TAG:
            continue
        guard_reason = _dynamic_guard_reason(node)
        if guard_reason is not None:
            out.append((node, wt_contrast.ContrastResult(verdict=wt_contrast.UNDECIDABLE, reason=guard_reason)))
            continue
        result = wt_contrast.worst_of(
            [wt_contrast.evaluate(sheet, node, scheme) for scheme in wt_css.SCHEMES]
        )
        out.append((node, result))
    return out


def _detail(result) -> str:
    if result.verdict == wt_contrast.FAIL:
        kind = "large" if result.large else "normal"
        return (
            f"{kind} text: contrast {result.min_ratio}:1 against a required "
            f"{result.threshold}:1 ({result.foreground} on {', '.join(result.backgrounds)})"
        )
    return f"contrast undecidable: {result.reason}"


def findings_and_undecidables(root: "audit.Node", sheet: "wt_css.Stylesheet", path: str) -> tuple:
    """`(findings, undecidables)` in `audit.py`'s own dict shape."""
    findings = []
    undecided = []
    for node, result in evaluate_template_contrast(root, sheet):
        if result.verdict == wt_contrast.FAIL:
            findings.append(audit._finding(CHECK, node, _detail(result), path))
        elif result.verdict == wt_contrast.UNDECIDABLE:
            undecided.append(audit._undecidable(CHECK, node, result.reason, path))
    return findings, undecided


def _color_detail(result) -> str:
    if result.ratio is not None and result.link_color:
        measured = (
            f"is {result.ratio}:1 against the text around it "
            f"({result.link_color} on prose in {result.text_color})"
        )
    else:
        measured = "is exactly the colour of the text around it"
    where = (
        " in " + " and ".join(f"{scheme} mode" for scheme in result.schemes)
        if len(result.schemes) == 1
        else ""
    )
    return (
        f"The link {measured}{where} and carries no underline, border, "
        "weight or background of its own, so colour is the only thing "
        "marking it as a link."
    )


def _use_of_color_guard(link: "audit.Node", surrounding: list) -> "str | None":
    """Dynamic class/style on the link, its ancestors, or the prose around it.

    A wrapper's render-time class can add an underline or a colour the
    template does not settle. A sibling span holding the surrounding text
    can do the same to the other side of the ratio. Either one withdraws
    the finding, same direction as 1.4.3.
    """
    guard = _dynamic_guard_reason(link)
    if guard is not None:
        return guard
    for owner, _ in surrounding:
        guard = _dynamic_guard_reason(owner)
        if guard is not None:
            return guard
    return None


def evaluate_template_use_of_color(root: "audit.Node", sheet: "wt_css.Stylesheet") -> list:
    """`[(link, LinkResult), ...]` for every in-prose link, with the
    dynamic-class/style guard applied before the resolver runs.
    """
    dark = wt_usecolor._declares_dark_scheme(sheet, root)
    out = []
    for link, block, surrounding in wt_usecolor.links_in_text(root, sheet):
        guard_reason = _use_of_color_guard(link, surrounding)
        if guard_reason is not None:
            out.append((link, wt_usecolor._undecidable(guard_reason)))
            continue
        result = wt_usecolor.worst_of(
            [
                (scheme, wt_usecolor.evaluate_link(
                    sheet, link, block, surrounding, scheme, dark))
                for scheme in wt_css.SCHEMES
            ]
        )
        out.append((link, result))
    return out


def findings_and_undecidables_use_of_color(
    root: "audit.Node", sheet: "wt_css.Stylesheet", path: str
) -> tuple:
    """`(findings, undecidables)` for SC 1.4.1, in `audit.py`'s dict shape."""
    findings = []
    undecided = []
    for node, result in evaluate_template_use_of_color(root, sheet):
        if result.verdict == wt_usecolor.FAIL:
            findings.append(
                audit._finding(USE_OF_COLOR_CHECK, node, _color_detail(result), path)
            )
        elif result.verdict == wt_usecolor.UNDECIDABLE:
            undecided.append(
                audit._undecidable(USE_OF_COLOR_CHECK, node, result.reason, path)
            )
    return findings, undecided


def _value_is_expr(value: str) -> bool:
    """True when a CSS property value still carries a template expression.

    External stylesheets arrive raw, so ``rotate({{ n }}deg)`` still has
    Liquid delimiters. Inline ``<style>`` blocks have already been through
    ``audit.strip_expressions``, so the same case arrives as a sentinel.
    Running the stripper first makes both spellings answer the same
    question.
    """
    return audit.is_expr(audit.strip_expressions(value))


def findings_and_undecidables_orientation(
    root: "audit.Node", sheet: "wt_css.Stylesheet", path: str
) -> tuple:
    """``(findings, undecidables)`` for SC 1.3.4, in ``audit.py``'s dict shape.

    Same document-level question as the sibling's ``rule_orientation_lock``:
    does any bare ``html``/``body`` type selector rotate the page under one
    orientation? One finding is enough. A transform value that is a template
    expression is undecidable rather than guessed; a later definite lock on
    the other element wins, because the barrier is then proven.
    """
    findings = []
    undecided = []
    pending = None
    for tag in ("html", "body"):
        node = next((n for n in root.iter() if n.tag == tag), None)
        if node is None:
            continue
        entry = sheet.element_property_for(tag, "transform")
        if entry is None:
            continue
        for orientation, value in wt_css.orientation_conditionals(entry):
            if _value_is_expr(value):
                if pending is None:
                    pending = (node, "transform-is-template-expression")
                continue
            if not _has_visual_rotation(value):
                continue
            findings.append(audit._finding(
                ORIENTATION_CHECK,
                node,
                f"<{tag}> is rotated ({value.strip()}) whenever the device "
                f"reports {orientation} orientation, locking the display to "
                "the other one with no way for the reader to undo it.",
                path,
            ))
            return findings, []
    if pending is not None:
        node, reason = pending
        undecided.append(
            audit._undecidable(ORIENTATION_CHECK, node, reason, path)
        )
    return findings, undecided
