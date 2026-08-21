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
Blade, EJS, Vue, Svelte — not the rendered HTML/CSS pairs #523 measured. Two
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

import audit  # noqa: E402

CHECK = "text-contrast-fail"

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
