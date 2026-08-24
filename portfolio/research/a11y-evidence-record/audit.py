#!/usr/bin/env python3
"""Static WCAG 2.2 AA audit over storefront templates, and the evidence record it produces.

Why this exists
---------------
`portfolio/pipeline/candidates/eaa-remediation-pipeline.md` is the pipeline's
highest-composite candidate (7.25) and the only one carrying a "build now"
verdict that nothing has yet been built for. Its first experiment opens with:

    "Build the audit-and-fix pass against three real shop themes; measure how
     many blocking issues the generated fixes actually close under AT
     verification."

The second half of that sentence needs a contractor with a screen reader and is
not doable by an unattended session. The first half is, and this file is it:
the audit pass, plus deliverable 4 of the same write-up --

    "Record -- a dated file listing what was tested, with what tool or AT, what
     changed, what remains open and why."

What is deliberately NOT here
-----------------------------
The write-up's liability section is a design constraint on this code, not a
disclaimer bolted onto it:

* **No compliance verdict.** There is no pass/fail, no score, and no
  "conformant" state anywhere in the output. `evidence_record()` emits findings,
  the date, the tool version, and -- always, non-optionally -- the list of
  success criteria this tool cannot test. A caller cannot render a record that
  omits its own coverage boundary, because the boundary is assembled in the same
  function as the findings.
* **No overlay, and nothing that edits a customer's site.** This reads files. It
  has no write path.
* **Undecidable is a third answer.** A template that emits `alt="{{ img.alt }}"`
  has an alt attribute whose value is unknown until render. Calling that a pass
  overstates coverage; calling it a failure invents a defect. It is counted as
  `undecidable` and reported separately, which is also the measurement in
  `README.md`.

Scope of the checks
-------------------
Every check below is decidable from markup alone and is written to under-report
rather than over-report -- the opposite bias from `mcp-tool-drift`'s classifier,
because the cost profile is inverted. There, a false positive costs a customer a
glance. Here, a false positive is a defect claimed against someone's shop, in a
deliverable whose entire value is that its claims hold up.

Usage
-----
    python3 audit.py path/to/templates --json findings.json
    python3 audit.py path/to/templates --record --scope "Dawn 15.3.0"

A ``--record`` run mutates a copy of each page and checks that the target
rule fires. That result is part of the record: a clean findings table with
a miss means the scanner could not read the page, which is not the same
claim as "no defects".

No third-party dependencies; standard library only. Reads files, writes only
where told to.
"""

from __future__ import annotations

import argparse
import collections
import datetime
import hashlib
import json
import os
import re
import sys
from html.parser import HTMLParser

TOOL = "portfolio/research/a11y-evidence-record/audit.py"
VERSION = "0.1.0"

MARKUP_EXT = (
    ".html", ".htm", ".liquid", ".hbs", ".handlebars", ".twig", ".ejs",
    ".njk", ".vue", ".php", ".svelte", ".mustache", ".volt", ".tpl",
)

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

# Template expression syntaxes, replaced by a sentinel before parsing so that
# `alt="{{ x }}"` reads as "attribute present, value unknown" rather than as
# malformed markup or as an empty string.
# Expressions are replaced by a sentinel that encodes a digest of the
# expression's own normalised source, so two attribute values written from the
# same expression compare equal while two written from different expressions do
# not. A single opaque sentinel -- what this used to be -- collapses every
# expression to one string, which loses that distinction in both directions: a
# control and its own `<label for>` in the same file looked unresolvable, and
# two unrelated expressions looked identical. See finding 3 in
# ../a11y-theme-resolution/README.md, which measured 64 of 69 supposedly
# "cross-partial" labels as having been in the same file all along.
#
# The digest is hex, so a sentinel can never contain a template delimiter and
# can never be re-matched by a later pattern in EXPR_SYNTAX.
EXPR_MARK = "\x00e:"
EXPR_SENTINEL = re.compile(r"\x00e:[0-9a-f]+\x00")
EXPR_SYNTAX = [
    re.compile(r"\{%.*?%\}", re.S),        # Liquid / Twig / Nunjucks statements
    re.compile(r"\{\{.*?\}\}", re.S),      # Liquid / Handlebars / Vue / Twig
    re.compile(r"\{#.*?#\}", re.S),        # Twig comments
    re.compile(r"<\?php.*?\?>", re.S),     # PHP
    re.compile(r"<\?=.*?\?>", re.S),       # PHP short echo
    re.compile(r"<%.*?%>", re.S),          # EJS / ERB / ASP
]

# Framework spellings of the same attribute. `:alt`, `v-bind:alt`, `[alt]` and
# `bind:alt` all set `alt`; treating them as absent would report every Vue,
# Angular and Svelte theme as missing everything.
BINDING_PREFIXES = (":", "v-bind:", "bind:", "x-bind:", "@")


def _sentinel(match: "re.Match") -> str:
    # All whitespace is removed before digesting, so `{{ id_prefix }}` and
    # `{{id_prefix}}` -- which render identically -- also compare identically.
    normalised = "".join(match.group(0).split())
    digest = hashlib.sha1(normalised.encode("utf-8")).hexdigest()[:12]
    return EXPR_MARK + digest + "\x00"


def strip_expressions(text: str) -> str:
    # NULs would forge a sentinel; templates never legitimately contain one.
    text = text.replace("\x00", "")
    for pattern in EXPR_SYNTAX:
        text = pattern.sub(_sentinel, text)
    return text


def is_expr(value: str | None) -> bool:
    return bool(value) and EXPR_MARK in value


def expr_free(value: str | None) -> str:
    """The literal part of an attribute value, with expressions removed."""
    return EXPR_SENTINEL.sub("", value or "").strip()


def _expr_pattern(value: str) -> "re.Pattern":
    """`value` as a regex in which each expression stands for any string."""
    literals = EXPR_SENTINEL.split(value)
    return re.compile(".*".join(re.escape(part) for part in literals), re.S)


def refs_can_match(a: str | None, b: str | None) -> bool:
    """Could these two raw attribute values ever render to the same id?

    Three cases, in increasing order of doubt:

    * Two literals match only when equal.
    * A literal against an expression-bearing value matches when the literal
      fits the pattern the expressions leave behind -- which is what makes
      `for="mce-NAME"` against `id="{{ p }}_mce-NAME"` a provable mismatch
      rather than an unknown, since no rendering of `p` puts the required `_`
      in front.
    * Two expression-bearing values built from the same expressions in the same
      order reduce to their literal parts, because the same expression renders
      the same way twice. Otherwise only the fixed text at each end can be
      checked, and anything that survives that returns True.

    True therefore means "cannot be ruled out", not "matches". Callers must
    treat it as undecidable rather than as a resolved label, because the whole
    positioning of this tool forbids claiming a defect it cannot prove.
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

    # Both carry expressions. Identical expressions render identically, so when
    # the two values are built from the same expressions in the same order,
    # equality reduces to their literal parts -- which is what separates
    # `id="{{ p }}_mce-NAME"` from a sibling `<label for="{{ p }}_gdpr_2201">`.
    # Without this, every expression-bearing label in a file looks like a
    # possible match for every expression-bearing control in it.
    a_lits, b_lits = EXPR_SENTINEL.split(a), EXPR_SENTINEL.split(b)
    if EXPR_SENTINEL.findall(a) == EXPR_SENTINEL.findall(b):
        return a_lits == b_lits

    # Different expressions: unknowable in general, but the fixed text at each
    # end still has to line up for any rendering to make them equal.
    if not (a_lits[0].startswith(b_lits[0]) or b_lits[0].startswith(a_lits[0])):
        return False
    if not (a_lits[-1].endswith(b_lits[-1]) or b_lits[-1].endswith(a_lits[-1])):
        return False
    return True


class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "line", "text_parts")

    def __init__(self, tag: str, attrs: dict, line: int, parent=None):
        self.tag = tag
        self.attrs = attrs
        self.children: list[Node] = []
        self.parent = parent
        self.line = line
        self.text_parts: list[str] = []

    def attr(self, name: str) -> str | None:
        """Attribute value, following framework binding spellings."""
        if name in self.attrs:
            return self.attrs[name]
        for prefix in BINDING_PREFIXES:
            if prefix + name in self.attrs:
                return self.attrs[prefix + name]
        if f"[{name}]" in self.attrs:  # Angular property binding
            return self.attrs[f"[{name}]"]
        return None

    def has_attr(self, name: str) -> bool:
        return self.attr(name) is not None

    def text(self) -> str:
        """Visible text of this element and its descendants."""
        out = list(self.text_parts)
        for child in self.children:
            if child.tag in ("script", "style", "template"):
                continue
            if child.attr("aria-hidden") == "true":
                continue
            out.append(child.text())
        return " ".join(part for part in out if part).strip()

    def descendants(self):
        for child in self.children:
            yield child
            yield from child.descendants()

    def iter(self):
        """Depth-first pre-order over this node and its descendants.

        Distinct from `descendants()` (which excludes `self`) because
        `contrast_pass.py` reuses the sibling probe's `wcag_triage.contrast`
        functions unmodified, and that module's `text_elements()` calls
        `root.iter()` expecting the root included.
        """
        yield self
        yield from self.descendants()

    def ancestors(self):
        """Nearest ancestor first, matching `wcag_triage.parser.Node.ancestors()`."""
        node = self.parent
        while node is not None:
            yield node
            node = node.parent

    def accessible_text(self) -> str:
        """Visible text, matching the sibling probe's method of the same name.

        The 1.4.1 resolver walks links through this rather than `text()`, so
        a template Node has to answer it the same way a rendered one does.
        """
        return self.text()


class Tree(HTMLParser):
    """A forgiving element tree. Unclosed `<p>`/`<li>` are normal in templates."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#document", {}, 0)
        self.stack = [self.root]
        self.ids: collections.Counter = collections.Counter()

    def handle_starttag(self, tag, attrs):
        node = Node(
            tag,
            {k.lower(): (v if v is not None else "") for k, v in attrs},
            self.getpos()[0],
            self.stack[-1],
        )
        self.stack[-1].children.append(node)
        if "id" in node.attrs:
            literal = expr_free(node.attrs["id"])
            if literal:
                self.ids[literal] += 1
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack[-1].tag == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        for depth in range(len(self.stack) - 1, 0, -1):
            if self.stack[depth].tag == tag:
                del self.stack[depth:]
                return
        # Stray close tag: ignore rather than reshuffle the tree.

    def handle_data(self, data):
        cleaned = EXPR_SENTINEL.sub(" ", data).strip()
        if cleaned:
            self.stack[-1].text_parts.append(cleaned)
        elif EXPR_MARK in data:
            # Text that is entirely a template expression: not literal text, but
            # not nothing either. Recorded so link/button checks can say
            # "undecidable" instead of "empty".
            self.stack[-1].text_parts.append("")


def parse(source: str) -> Tree:
    tree = Tree()
    tree.feed(strip_expressions(source))
    return tree


# ---------------------------------------------------------------------------
# Checks
#
# Each returns (findings, undecidables). A finding is a defect claimed against
# the customer's markup; an undecidable is an honest "this needs a rendered page
# or a human". The split is the point -- see README, finding 2.
# ---------------------------------------------------------------------------

# sc: WCAG 2.2 success criterion. severity: does it stop a task or degrade one?
CHECKS = {
    "img-alt-missing":       ("1.1.1 Non-text Content", "blocking"),
    "img-alt-filename":      ("1.1.1 Non-text Content", "degrading"),
    "link-no-accessible-name": ("2.4.4 Link Purpose (In Context)", "blocking"),
    "button-no-accessible-name": ("4.1.2 Name, Role, Value", "blocking"),
    "control-no-label":      ("3.3.2 Labels or Instructions", "blocking"),
    "html-lang-missing":     ("3.1.1 Language of Page", "blocking"),
    # Added 2026-08-24. Existence was already checked; validity was not, so
    # lang="engl" read as clean while this catalog called 3.1.1 checked. The
    # sibling engine closed the same overclaim on 2026-08-22. Degrading: the
    # page is still there; pronunciation is wrong.
    "html-lang-invalid":     ("3.1.1 Language of Page", "degrading"),
    "title-missing":         ("2.4.2 Page Titled", "degrading"),
    "iframe-no-title":       ("4.1.2 Name, Role, Value", "blocking"),
    "aria-reference-broken": ("1.3.1 Info and Relationships", "blocking"),
    "label-for-broken":      ("3.3.2 Labels or Instructions", "blocking"),
    "label-for-id-mismatch": ("3.3.2 Labels or Instructions", "blocking"),
    "duplicate-referenced-id": ("1.3.1 Info and Relationships", "blocking"),
    "positive-tabindex":     ("2.4.3 Focus Order", "blocking"),
    "viewport-scaling-blocked": ("1.4.4 Resize Text", "blocking"),
    "autoplay-unmuted":      ("1.4.2 Audio Control", "blocking"),
    "data-table-no-header":  ("1.3.1 Info and Relationships", "degrading"),
    "heading-level-skipped": ("1.3.1 Info and Relationships", "degrading"),
    # Added 2026-08-21. Both were checked by the sibling engine
    # (`portfolio/pipeline/probes/eaa-wcag-triage/`) and by this one neither
    # checked nor listed in NOT_TESTED, so a record emitted here was silent
    # about them -- see `portfolio/research/a11y-engine-agreement/`.
    "media-no-captions":     ("1.2.2 Captions (Prerecorded)", "blocking"),
    "interactive-aria-hidden": ("4.1.2 Name, Role, Value", "blocking"),
    # Added 2026-08-21, porting the resolver #523 built for the sibling engine
    # (portfolio/pipeline/probes/eaa-wcag-triage/) — see contrast_pass.py for
    # what the port had to change and why. Only produces a finding when the
    # caller supplied a stylesheet AND the element's colours are undisturbed
    # by any dynamically-rendered class/style up its ancestor chain; every
    # other case is an honestly-reasoned undecidable, never a silent skip.
    "text-contrast-fail":    ("1.4.3 Contrast (Minimum)", "blocking"),
    # Added 2026-08-24, porting the sibling engine's 1.4.1 resolver the same
    # way 1.4.3 was ported: reuse the arithmetic, refuse any dynamically
    # classed or styled ancestor (or surrounding-text owner). See
    # contrast_pass.py. Closes the asymmetry a11y-engine-agreement recorded
    # when the probe gained this criterion and this engine did not.
    "color-only-link":       ("1.4.1 Use of Color", "blocking"),
    # Added 2026-08-24, porting the sibling engine's markup-decidable rules
    # the same way 1.4.1 was ported: reuse the sibling's decision (here, its
    # BCP-47 check) rather than reimplement it, and refuse a template
    # expression rather than guess. 2.2.1 / 2.2.2 need no sibling import.
    "meta-refresh":          ("2.2.1 Timing Adjustable", "blocking"),
    "moving-content":        ("2.2.2 Pause, Stop, Hide", "blocking"),
    "lang-of-parts-invalid": ("3.1.2 Language of Parts", "degrading"),
    # Added 2026-08-24, the two leftover markup rules #728 left disclosed.
    # Same decision as the sibling's 2026-08-22 rules, plus the template
    # adaptation this engine already uses: an expression that could be a
    # skip link, a landmark role, or either side of a 2.5.3 comparison is
    # undecidable, never a guessed defect.
    "bypass-blocks":         ("2.4.1 Bypass Blocks", "blocking"),
    "label-in-name":         ("2.5.3 Label in Name", "blocking"),
    # Added 2026-08-24, the leftover CSS-adapter row. Reuses the sibling's
    # orientation-lock decision (bare html/body type selectors under a
    # pure orientation query) and refuses a transform value that is a
    # template expression rather than guessing a lock. See contrast_pass.py.
    "orientation-lock":      ("1.3.4 Orientation", "blocking"),
}

FILENAME_ALT = re.compile(
    r"^[\w\-. ]+\.(?:jpe?g|png|gif|svg|webp|avif|bmp|ico)$", re.I
)

LABELLABLE = {"input", "select", "textarea"}
NO_LABEL_TYPES = {"hidden", "submit", "reset", "button", "image"}

# Elements that take keyboard focus by default, and so stay reachable by Tab
# even when `aria-hidden="true"` has removed them from the accessibility tree.
# `<input type=hidden>` is excluded because it is not focusable to begin with.
FOCUSABLE = {"a", "button", "input", "select", "textarea"}

# `kind` values on a <track> that satisfy 1.2.2. `subtitles` is accepted
# because the distinction from `captions` is editorial (translation vs. sound
# description) and firing on it would be a false positive more often than not.
CAPTION_KINDS = {"captions", "subtitles"}

_REFRESH_DELAY = re.compile(r"^\s*(\d+(?:\.\d+)?)")
_MOVING_TAGS = frozenset({"blink", "marquee"})

# Sibling thresholds for 2.4.1 -- see wcag_triage.rules.rule_bypass_blocks.
# Ten links without a <nav> is a judgement, kept identical so the two
# engines decide the same pages. Two hundred characters of non-navigation
# text is the content gate that stopped the sibling firing on a
# prerendered "Loading…" shell.
_REPEATED_BLOCK_LINKS = 10
_MIN_CONTENT_CHARS = 200
_TEXT_OPAQUE = frozenset({"script", "style", "template", "noscript"})

# Roles whose accessible name is computed from their own content. A
# textbox is out of scope: its visible label is a separate element.
_NAME_FROM_CONTENT_ROLES = frozenset({
    "button", "link", "checkbox", "radio",
    "menuitem", "menuitemcheckbox", "menuitemradio",
    "option", "switch", "tab", "treeitem",
})
_INPUT_SELF_NAMED = frozenset({"submit", "button", "reset"})
_NAME_NOISE = re.compile(r"[^\w\s]", re.UNICODE)

_lang_check = None


def _lang_reason(value: str):
    """None if `value` is a usable language tag, else a reason.

    Reuses the sibling engine's BCP-47 + ISO 639-1 check, including the
    `lang="engl"` case a grammar-only test misses. Three-letter codes are
    accepted without a registry lookup -- the same under-report the sibling
    states, on purpose.
    """
    global _lang_check
    if _lang_check is None:
        probe_src = os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "pipeline",
            "probes", "eaa-wcag-triage", "src"))
        if probe_src not in sys.path:
            sys.path.insert(0, probe_src)
        from wcag_triage.lang import check as _imported
        _lang_check = _imported
    return _lang_check(value)


def _role_token(node: Node) -> tuple[str, bool]:
    """(first role token, undecidable). An expression-only role is unknown."""
    raw = node.attr("role")
    if raw is None:
        return "", False
    if is_expr(raw) and not expr_free(raw):
        return "", True
    tokens = expr_free(raw).lower().split()
    return (tokens[0] if tokens else ""), False


def _non_navigation_text(node: Node) -> str:
    """Visible text that is not the navigation the reader wants past.

    Port of the sibling's helper: skip nav subtrees, aria-hidden subtrees,
    and script/style so a page of links or framework bootstrap cannot look
    like a page with something to skip to.
    """
    role, role_unknown = _role_token(node)
    if node.tag in _TEXT_OPAQUE or node.tag == "nav" or role == "navigation":
        return ""
    if (node.attr("aria-hidden") or "").strip().lower() == "true":
        return ""
    if role_unknown:
        return ""
    parts = [part.strip() for part in node.text_parts if part and part.strip()]
    for child in node.children:
        text = _non_navigation_text(child)
        if text:
            parts.append(text)
    return " ".join(parts)


def _normalised_name(text: str) -> str:
    return " ".join(_NAME_NOISE.sub(" ", text.casefold()).split())


def _id_index(nodes: list[Node]) -> dict[str, Node]:
    index: dict[str, Node] = {}
    for node in nodes:
        raw = node.attr("id")
        if raw is None or is_expr(raw):
            continue
        literal = expr_free(raw)
        if literal and literal not in index:
            index[literal] = node
    return index


def _takes_name_from_content(node: Node) -> bool:
    role, role_unknown = _role_token(node)
    if role_unknown:
        return False
    if role:
        return role in _NAME_FROM_CONTENT_ROLES
    if node.tag == "button":
        return True
    if node.tag == "a":
        return node.has_attr("href")
    if node.tag == "input":
        return expr_free(node.attr("type")).lower() in _INPUT_SELF_NAMED
    return False


def _overriding_name(node: Node, ids: dict[str, Node]) -> tuple[str | None, bool]:
    """(accessible name from an override, undecidable).

    None means "no name this rule may reason about": no override, or an
    aria-labelledby that points at an id this document does not define.
    """
    labelledby = node.attr("aria-labelledby")
    if labelledby is not None:
        if is_expr(labelledby) and not expr_free(labelledby):
            return None, True
        parts = []
        for target_id in expr_free(labelledby).split():
            target = ids.get(target_id)
            if target is None:
                return None, False
            text = target.text()
            if not text and any(part == "" for part in target.text_parts):
                return None, True
            if text:
                parts.append(text)
        joined = " ".join(parts).strip()
        return (joined or None), False
    raw = node.attr("aria-label")
    if raw is None:
        return None, False
    if is_expr(raw) and not expr_free(raw):
        return None, True
    return expr_free(raw) or None, False


def _visible_label(node: Node) -> tuple[str | None, bool]:
    """(visible text on the control, undecidable).

    None means "not decidable", never "empty". An image-of-text label is
    refused: an alt is a description, not a transcription, and firing on
    the difference would be a guess. A glyph-only label is the caller's
    problem -- this just returns the glyph.
    """
    if node.tag == "input":
        raw = node.attr("value")
        if raw is None:
            return None, False
        if is_expr(raw) and not expr_free(raw):
            return None, True
        return expr_free(raw) or None, False
    for child in node.descendants():
        if child.tag == "img" and expr_free(child.attr("alt")):
            return None, False
    text = node.text()
    if text:
        return text, False
    if any(part == "" for part in node.text_parts) or any(
        part == "" for child in node.descendants() for part in child.text_parts
    ):
        return None, True
    return None, False


def _accessible_name(node: Node) -> tuple[str, bool]:
    """(name, undecidable). Literal text only; expressions mark it undecidable."""
    for attr in ("aria-label", "title"):
        value = node.attr(attr)
        if value is not None:
            if is_expr(value):
                return "", True
            if expr_free(value):
                return expr_free(value), False
    if node.has_attr("aria-labelledby"):
        return "referenced", False
    text = node.text()
    if text:
        return text, False
    # An image child with alt text names the link or button.
    for child in node.descendants():
        if child.tag in ("img", "svg", "image"):
            alt = child.attr("alt") or child.attr("aria-label")
            if is_expr(alt):
                return "", True
            if expr_free(alt):
                return expr_free(alt), False
        if child.tag == "use" or child.tag == "title":
            if child.text():
                return child.text(), False
    # Any template expression anywhere inside could render as the name.
    if any("" == part for part in node.text_parts):
        return "", True
    for child in node.descendants():
        if any("" == part for part in child.text_parts):
            return "", True
    return "", False


def _finding_at(kind, source, line, element, detail):
    sc, severity = CHECKS[kind]
    return {
        "check": kind,
        "success_criterion": sc,
        "severity": severity,
        "file": source,
        "line": line,
        "element": element,
        "detail": detail,
    }


def _finding(kind, node, detail, source):
    return _finding_at(kind, source, node.line, node.tag, detail)


def _undecidable(kind, node, reason, source, raw_id=None):
    item = {
        "check": kind,
        "success_criterion": CHECKS[kind][0],
        "file": source,
        "line": node.line,
        "element": node.tag,
        "reason": reason,
    }
    if raw_id is not None:
        item["raw_id"] = raw_id
    return item


def audit_source(source: str, path: str = "<string>", stylesheet=None) -> dict:
    """Audit one template. Returns findings, undecidables, and element counts.

    `stylesheet` is an optional `wcag_triage.css.Stylesheet` -- external CSS
    the caller has for this template (see `contrast_pass.merge_stylesheets`).
    Contrast (1.4.3) is always evaluated, stylesheet or not: with none, every
    text-bearing element still gets an honestly-reasoned `no-declared-color`
    undecidable rather than being silently skipped -- the same coverage-
    boundary rule the rest of this module follows. Use of Color (1.4.1) is
    evaluated the same way, on the narrower set of in-prose links; a bare
    link with no stylesheet still has the browser underline, so it passes
    rather than going undecidable. Orientation (1.3.4) is the same pass over
    the same stylesheet: no lock found is a pass, not an undecidable, because
    the criterion is a single document-level yes/no. A template's own inline
    `<style>` blocks are picked up either way.
    """
    tree = parse(source)
    findings: list[dict] = []
    undecided: list[dict] = []
    nodes = list(tree.root.descendants())
    by_tag = collections.Counter(n.tag for n in nodes)

    # Two sets, because they answer different questions. `referenced_ids` is
    # "does anything point at this id at all", which is what makes a duplicate
    # id ambiguous. `labelling_ids` is "does a <label for> name this control" --
    # narrower on purpose: aria-labelledby on X pointing at Y means Y labels X,
    # and aria-controls means neither.
    referenced_ids: set[str] = set()
    labelling_ids: set[str] = set()
    # Raw `<label for>` targets, expressions intact, for the render-aware
    # matching in the resolution pass below.
    labelling_raw: set[str] = set()
    is_fragment = by_tag.get("html", 0) == 0
    ids = _id_index(nodes)

    for node in nodes:
        hidden = node.attr("aria-hidden") == "true" or node.has_attr("hidden")

        # --- 1.1.1 images -------------------------------------------------
        if node.tag == "img":
            alt = node.attr("alt")
            if alt is None:
                if node.attr("role") == "presentation" or node.attr("role") == "none":
                    pass  # explicitly decorative
                elif hidden:
                    pass
                else:
                    findings.append(_finding(
                        "img-alt-missing", node,
                        "img has no alt attribute; a screen reader announces the "
                        "file name or nothing", path))
            elif is_expr(alt) and not expr_free(alt):
                undecided.append(_undecidable(
                    "img-alt-missing", node,
                    "alt is a template expression; its rendered value is unknown "
                    "without the data", path))
            elif FILENAME_ALT.match(expr_free(alt)):
                findings.append(_finding(
                    "img-alt-filename", node,
                    f"alt text is a file name ({expr_free(alt)!r})", path))

        # --- 2.4.4 / 4.1.2 links and buttons ------------------------------
        if node.tag == "a" and node.has_attr("href") and not hidden:
            name, unknown = _accessible_name(node)
            if unknown:
                undecided.append(_undecidable(
                    "link-no-accessible-name", node,
                    "link content is a template expression", path))
            elif not name:
                findings.append(_finding(
                    "link-no-accessible-name", node,
                    "link has no text, aria-label, title, or image alt", path))

        if node.tag == "button" or (node.tag == "input" and node.attr("type") in ("button", "submit", "reset")):
            if not hidden:
                if node.tag == "input":
                    value = node.attr("value")
                    name = expr_free(value)
                    unknown = is_expr(value) and not name
                    if not name and not unknown:
                        name, unknown = _accessible_name(node)
                else:
                    name, unknown = _accessible_name(node)
                if unknown:
                    undecided.append(_undecidable(
                        "button-no-accessible-name", node,
                        "button label is a template expression", path))
                elif not name:
                    findings.append(_finding(
                        "button-no-accessible-name", node,
                        "button has no text, value, aria-label, or image alt", path))

        # --- 3.3.2 form controls -----------------------------------------
        if node.tag in LABELLABLE and not hidden:
            control_type = (expr_free(node.attr("type")) or "text").lower()
            if control_type not in NO_LABEL_TYPES:
                labelled = (
                    node.has_attr("aria-label")
                    or node.has_attr("aria-labelledby")
                    or node.has_attr("title")
                )
                raw_id = node.attr("id") or ""
                # A wrapping <label> only names the control if the label
                # itself has a name. Until 2026-08-21 any `<label>` ancestor
                # counted, so `<label><input></label>` -- a control inside an
                # empty wrapper -- read as labelled and this engine reported
                # nothing, while the sibling engine
                # (portfolio/pipeline/probes/eaa-wcag-triage) flagged it 1.3.1.
                # That was a detection gap, not the relabelling divergence the
                # two engines were already known to have; it survived because
                # no corpus either engine had run on wrapped its controls
                # instead of using `for=`. See
                # portfolio/research/a11y-generated-sites/.
                #
                # An expression-bearing label stays `wrapped`: a template that
                # renders its text at build time is undecidable here, and this
                # engine's standing rule is that undecidable is not a finding.
                wrapped = False
                ancestor = node.parent
                while ancestor is not None:
                    if ancestor.tag == "label":
                        name, undecidable = _accessible_name(ancestor)
                        wrapped = bool(name) or undecidable
                        break
                    ancestor = ancestor.parent
                if not labelled and not wrapped:
                    if raw_id:
                        # Resolved after the pass, once every <label for> is
                        # known. The *raw* id is carried, expressions included,
                        # so the resolution can tell "same expression" from
                        # "some expression".
                        node.attrs["__needs_label_for"] = raw_id
                    else:
                        findings.append(_finding(
                            "control-no-label", node,
                            f"<{node.tag}> has no label, aria-label, "
                            "aria-labelledby, title, or wrapping <label>", path))

        # --- 4.1.2 iframes -------------------------------------------------
        if node.tag == "iframe" and not hidden:
            title = node.attr("title") or node.attr("aria-label")
            if title is None:
                findings.append(_finding(
                    "iframe-no-title", node,
                    "iframe has no title or aria-label, so it is announced only "
                    "as an unnamed frame", path))

        # --- 2.4.3 focus order --------------------------------------------
        tabindex = expr_free(node.attr("tabindex"))
        if tabindex.lstrip("+").isdigit() and int(tabindex) > 0:
            findings.append(_finding(
                "positive-tabindex", node,
                f"tabindex={tabindex} moves this element out of document order "
                "for every keyboard user on the page", path))

        # --- 1.4.4 zoom -----------------------------------------------------
        if node.tag == "meta" and expr_free(node.attr("name")).lower() == "viewport":
            content = expr_free(node.attr("content")).lower()
            blocked = "user-scalable=no" in content.replace(" ", "")
            cap = re.search(r"maximum-scale\s*=\s*([\d.]+)", content)
            if cap:
                try:
                    blocked = blocked or float(cap.group(1)) < 2.0
                except ValueError:
                    pass
            if blocked:
                findings.append(_finding(
                    "viewport-scaling-blocked", node,
                    f"viewport meta prevents zooming to 200% ({content!r})", path))

        # --- 2.2.1 timing adjustable ----------------------------------------
        # A positive-delay <meta http-equiv=refresh> is a timer the reader
        # cannot extend. content="0" is an immediate redirect, not a limit.
        if node.tag == "meta":
            http_equiv = node.attr("http-equiv")
            refresh_content = node.attr("content")
            if http_equiv is not None:
                if is_expr(http_equiv) and not expr_free(http_equiv):
                    undecided.append(_undecidable(
                        "meta-refresh", node,
                        "http-equiv is a template expression; whether this "
                        "is a refresh is unknown without the data", path))
                elif expr_free(http_equiv).lower() == "refresh":
                    if is_expr(refresh_content) and not expr_free(refresh_content):
                        undecided.append(_undecidable(
                            "meta-refresh", node,
                            "refresh delay is a template expression", path))
                    else:
                        match = _REFRESH_DELAY.match(expr_free(refresh_content) or "")
                        if match is not None:
                            delay = float(match.group(1))
                            if delay > 0:
                                findings.append(_finding(
                                    "meta-refresh", node,
                                    f"The page refreshes itself after {delay:g}s, "
                                    "with no way to turn the timer off, extend "
                                    "it, or finish reading first.", path))

        # --- 2.2.2 pause, stop, hide ----------------------------------------
        if node.tag in _MOVING_TAGS and not hidden:
            findings.append(_finding(
                "moving-content", node,
                f"<{node.tag}> moves its content continuously and offers no "
                "way to pause, stop, or hide it.", path))

        # --- 3.1.2 language of parts ----------------------------------------
        # Root <html lang> is 3.1.1's business (existence + validity below).
        if node.tag != "html":
            for attr in ("lang", "xml:lang"):
                if not node.has_attr(attr):
                    continue
                raw = node.attr(attr)
                if is_expr(raw) and not expr_free(raw):
                    undecided.append(_undecidable(
                        "lang-of-parts-invalid", node,
                        f"{attr} is a template expression; whether it names "
                        "a language is unknown without the data", path))
                    break
                if _lang_reason(expr_free(raw)) is not None:
                    findings.append(_finding(
                        "lang-of-parts-invalid", node,
                        f"<{node.tag} {attr}> names no usable language "
                        f"({expr_free(raw)!r}), so a screen reader falls "
                        "back to the surrounding language", path))
                    break

        # --- 1.4.2 audio ----------------------------------------------------
        if node.tag in ("video", "audio") and node.has_attr("autoplay"):
            if not node.has_attr("muted"):
                findings.append(_finding(
                    "autoplay-unmuted", node,
                    f"<{node.tag} autoplay> without muted starts sound the user "
                    "did not ask for and cannot easily stop", path))

        # --- 1.2.2 captions -------------------------------------------------
        # Only <video>: 1.2.2 is about synchronized media, and audio-only
        # content falls under 1.2.1, which needs a transcript this pass cannot
        # see. A <track> whose kind is a template expression withdraws the
        # claim rather than making it -- the render might supply captions.
        if node.tag == "video":
            tracks = [d for d in node.descendants() if d.tag == "track"]
            kinds = [t.attr("kind") for t in tracks]
            if any(is_expr(k) and not expr_free(k) for k in kinds):
                undecided.append(_undecidable(
                    "media-no-captions", node,
                    "a <track kind> is a template expression; whether the "
                    "rendered page offers captions is unknown without the data",
                    path))
            elif not any(expr_free(k).lower() in CAPTION_KINDS for k in kinds):
                findings.append(_finding(
                    "media-no-captions", node,
                    "<video> has no <track kind=captions>; deaf and "
                    "hard-of-hearing users get no captions", path))

        # --- 4.1.2 aria-hidden on a focusable control -----------------------
        # `aria-hidden` removes the element from the accessibility tree but
        # not from the tab order, so a screen-reader user tabs onto a control
        # that announces nothing. `hidden` and `tabindex="-1"` both remove it
        # from the tab order too, which makes aria-hidden legitimate there.
        if node.tag in FOCUSABLE and expr_free(node.attr("aria-hidden")).lower() == "true":
            focusable = not node.has_attr("hidden")
            if node.tag == "a" and not node.has_attr("href"):
                focusable = False
            if node.tag == "input" and expr_free(node.attr("type")).lower() == "hidden":
                focusable = False
            if expr_free(node.attr("tabindex")).strip() == "-1":
                focusable = False
            if focusable:
                findings.append(_finding(
                    "interactive-aria-hidden", node,
                    f'<{node.tag}> is aria-hidden="true" but still keyboard '
                    "focusable, so it is announced as nothing when tabbed to",
                    path))

        # --- 2.5.3 label in name -------------------------------------------
        # A speech-input user activates a control by saying what it says.
        # When the button reads "Buy now" and its accessible name is
        # "Submit order", the spoken command matches nothing. Same
        # decision as the sibling's rule_label_in_name, plus expressions.
        if _takes_name_from_content(node):
            if (node.attr("aria-hidden") or "").strip().lower() != "true":
                accessible, name_unknown = _overriding_name(node, ids)
                # No override: the name comes from the content, so the
                # criterion holds. Do not mark an expression-only label
                # undecidable here -- that is the naming rule's job.
                if accessible or name_unknown:
                    visible, visible_unknown = _visible_label(node)
                    if name_unknown or visible_unknown:
                        undecided.append(_undecidable(
                            "label-in-name", node,
                            "the visible label or its accessible-name "
                            "override is a template expression; whether "
                            "one contains the other is unknown without "
                            "the data", path))
                    elif (
                        visible is not None
                        and accessible
                        and any(char.isalnum() for char in visible)
                        and _normalised_name(visible) not in _normalised_name(accessible)
                    ):
                        findings.append(_finding(
                            "label-in-name", node,
                            f'The control reads "{visible}" but is announced '
                            f'as "{accessible}", which does not contain the '
                            "visible text. Speech input has nothing to match, "
                            "so saying what the control says does not "
                            "operate it.", path))

        # --- 1.3.1 data tables ---------------------------------------------
        if node.tag == "table" and node.attr("role") not in ("presentation", "none"):
            descendants = list(node.descendants())
            rows = [d for d in descendants if d.tag == "tr"]
            has_th = any(d.tag == "th" for d in descendants)
            if len(rows) >= 2 and not has_th:
                findings.append(_finding(
                    "data-table-no-header", node,
                    f"table has {len(rows)} rows and no <th>; cells are announced "
                    "without their column or row meaning", path))

        # --- reference integrity -------------------------------------------
        for attr in ("aria-labelledby", "aria-describedby", "aria-controls"):
            value = node.attr(attr)
            if value and not is_expr(value):
                referenced_ids.update(expr_free(value).split())
        if node.tag == "label":
            target = node.attr("for")
            if target:
                # Raw, so an expression-bearing `for` is still a candidate
                # label rather than being dropped from consideration entirely.
                labelling_raw.add(target)
            if target and not is_expr(target):
                referenced_ids.add(expr_free(target))
                labelling_ids.add(expr_free(target))

    # --- document-level checks (skipped for fragments) ----------------------
    html_nodes = [n for n in nodes if n.tag == "html"]
    if html_nodes:
        root = html_nodes[0]
        if not root.has_attr("lang") and not root.has_attr("xml:lang"):
            findings.append(_finding(
                "html-lang-missing", root,
                "<html> has no lang attribute, so assistive technology guesses "
                "the pronunciation of the whole page", path))
        else:
            raw_lang = root.attr("lang") if root.has_attr("lang") else root.attr("xml:lang")
            if is_expr(raw_lang) and not expr_free(raw_lang):
                undecided.append(_undecidable(
                    "html-lang-invalid", root,
                    "lang is a template expression; whether it names a "
                    "language is unknown without the data", path))
            elif _lang_reason(expr_free(raw_lang)) is not None:
                findings.append(_finding(
                    "html-lang-invalid", root,
                    f"<html lang> names no usable language "
                    f"({expr_free(raw_lang)!r}), so assistive technology "
                    "guesses the pronunciation of the whole page", path))
        heads = [n for n in nodes if n.tag == "head"]
        titles = [n for n in nodes if n.tag == "title" and n.parent and n.parent.tag == "head"]
        if heads and not titles:
            findings.append(_finding(
                "title-missing", heads[0],
                "document has a <head> but no <title>", path))
        elif heads and not any(t.text() or t.text_parts for t in titles):
            # A <title> that renders nothing is the same defect as no <title>;
            # one whose content is a template expression is not, so text_parts
            # (which records expression-only content as "") counts as present.
            findings.append(_finding(
                "title-missing", titles[0],
                "<title> is empty", path))

        # --- 2.4.1 bypass blocks -------------------------------------------
        # Document-level, same three gates as the sibling: a block to
        # bypass, content to bypass to, and no mechanism (main, heading,
        # or in-page link). A fragment is not a page. An expression that
        # could be a skip-link href or a landmark role withdraws the
        # claim rather than guessing -- the same template adaptation
        # 2.2.1 / 3.1.2 already use.
        body = next((n for n in nodes if n.tag == "body"), None)
        if body is not None:
            has_nav = False
            heading = False
            landmark = False
            internal_link = False
            possible_mechanism = False
            links = 0
            for node in nodes:
                role, role_unknown = _role_token(node)
                if role_unknown:
                    possible_mechanism = True
                if node.tag == "nav" or role == "navigation":
                    has_nav = True
                elif node.tag == "main" or role == "main":
                    landmark = True
                elif len(node.tag) == 2 and node.tag[0] == "h" and node.tag[1] in "123456":
                    heading = True
                elif node.tag == "a" and node.has_attr("href"):
                    href = node.attr("href") or ""
                    links += 1
                    if is_expr(href) and not expr_free(href):
                        possible_mechanism = True
                    elif href.startswith("#") and len(href) > 1:
                        internal_link = True
            if (has_nav or links >= _REPEATED_BLOCK_LINKS) and not (
                landmark or heading or internal_link
            ):
                if len(_non_navigation_text(body)) >= _MIN_CONTENT_CHARS:
                    if possible_mechanism:
                        undecided.append(_undecidable(
                            "bypass-blocks", body,
                            "a role or in-page href is a template "
                            "expression; whether a bypass mechanism is "
                            "present is unknown without the data", path))
                    else:
                        findings.append(_finding(
                            "bypass-blocks", body,
                            "The page has a block of navigation links and "
                            "no way past it: no skip link, no <main> "
                            "landmark, and no heading. A keyboard or "
                            "screen-reader user has to travel the whole "
                            "navigation again on every page.", path))

    # --- resolve label/aria references now that every id is known -----------
    known_ids = set(tree.ids)

    # A `<label for>` that can match no id in this file under any rendering is
    # dead: the label was written, and nothing it names can ever exist here.
    all_raw_ids = {n.attrs["id"] for n in nodes if n.attrs.get("id")}
    dangling_labels = sorted(
        t for t in labelling_raw
        if not any(refs_can_match(t, raw) for raw in all_raw_ids)
    )

    for node in nodes:
        pending = node.attrs.get("__needs_label_for")
        if pending is None:
            continue
        del node.attrs["__needs_label_for"]
        shown = expr_free(pending) or "<expression>"

        # Certain match: the same raw text, so the same render. This is the
        # case finding 3 measured as 64 of 69 -- a control and its own label,
        # in one file, previously reported undecidable.
        if pending in labelling_raw or (
            not is_expr(pending) and pending in labelling_ids
        ):
            continue

        possible = [t for t in labelling_raw if refs_can_match(pending, t)]
        if possible:
            # Some label here could name it, depending on what the expressions
            # render to. Not provable either way from the template alone.
            undecided.append(_undecidable(
                "control-no-label", node,
                f"no <label for={shown!r}> in this file matches for certain; "
                f"{len(possible)} label(s) here could match depending on what "
                "the template expressions render to", path))
        elif not is_fragment:
            findings.append(_finding(
                "control-no-label", node,
                f"no <label for={shown!r}> anywhere in the document", path))
        elif dangling_labels:
            # Both halves of the fassbender mechanism are present in one file:
            # an unlabelled control, and a label naming an id nothing here can
            # render. Reported as a finding rather than an undecidable, per
            # finding 3 -- a literal-only comparison cannot see this, because it
            # reads the id it cannot resolve as "unknown" instead of "wrong".
            findings.append(_finding(
                "label-for-id-mismatch", node,
                f"<{node.tag}> is unlabelled, and this file's "
                f"<label for={expr_free(dangling_labels[0])!r}> matches no "
                "control here under any rendering, so the label written for it "
                "is dead in the rendered page", path))
        else:
            undecided.append(_undecidable(
                "control-no-label", node,
                f"no <label for={shown!r}> in this file; the label may live "
                "in another partial of the same page", path,
                raw_id=pending))

    if not is_fragment:
        for node in nodes:
            for attr in ("aria-labelledby", "aria-describedby"):
                value = node.attr(attr)
                if not value or is_expr(value):
                    continue
                missing = [t for t in expr_free(value).split() if t not in known_ids]
                if missing:
                    findings.append(_finding(
                        "aria-reference-broken", node,
                        f"{attr} points at {' '.join(missing)!r}, which is not an "
                        "id in this document", path))
            if node.tag == "label":
                target = node.attr("for")
                if target and not is_expr(target) and expr_free(target) not in known_ids:
                    findings.append(_finding(
                        "label-for-broken", node,
                        f"<label for={expr_free(target)!r}> matches no control", path))
        for dup_id, count in tree.ids.items():
            if count > 1 and dup_id in referenced_ids:
                node = next(
                    (n for n in nodes if expr_free(n.attrs.get("id") or "") == dup_id),
                    None,
                )
                if node is None:
                    continue
                findings.append(_finding(
                    "duplicate-referenced-id", node,
                    f"id {dup_id!r} appears {count} times and is referenced by a "
                    "label or aria attribute, so the association is ambiguous", path))

    # --- 1.4.3 contrast -------------------------------------------------
    # Local import: contrast_pass.py imports this module back (it calls
    # audit.Node.ancestors(), audit.is_expr(), audit._finding/_undecidable),
    # so importing it at module level here would be a straight circular
    # import at load time. Deferring it to call time -- by which point this
    # module has finished initialising -- is the standard way out.
    import contrast_pass
    sheet = contrast_pass.stylesheet_for(tree.root, stylesheet)
    contrast_findings, contrast_undecided = contrast_pass.findings_and_undecidables(
        tree.root, sheet, path)
    findings.extend(contrast_findings)
    undecided.extend(contrast_undecided)
    color_findings, color_undecided = contrast_pass.findings_and_undecidables_use_of_color(
        tree.root, sheet, path)
    findings.extend(color_findings)
    undecided.extend(color_undecided)
    orientation_findings, orientation_undecided = (
        contrast_pass.findings_and_undecidables_orientation(
            tree.root, sheet, path)
    )
    findings.extend(orientation_findings)
    undecided.extend(orientation_undecided)

    # --- heading order (advisory) -------------------------------------------
    levels = [
        (n, int(n.tag[1]))
        for n in nodes
        if len(n.tag) == 2 and n.tag[0] == "h" and n.tag[1].isdigit()
    ]
    previous = None
    for node, level in levels:
        if previous is not None and level > previous + 1:
            findings.append(_finding(
                "heading-level-skipped", node,
                f"<{node.tag}> follows <h{previous}>; the outline skips a level",
                path))
        previous = level

    return {
        "file": path,
        "findings": findings,
        "undecidable": undecided,
        "elements": sum(by_tag.values()),
        "is_fragment": is_fragment,
        "tags": dict(by_tag),
        # Package-wide resolution (see resolve_package_labels) needs the raw
        # `<label for>` targets this file contributed. JSON-serialisable lists
        # so a saved per-file result can still be re-resolved offline.
        "labelling_raw": sorted(labelling_raw),
        "labelling_ids": sorted(labelling_ids),
    }


# ---------------------------------------------------------------------------
# What this tool cannot test.
#
# This list is not documentation. It is emitted into every evidence record by
# `evidence_record()`, in the same structure as the findings, because a record
# that reports defects without reporting its own blind spots is the overclaim
# the candidate write-up refuses to sell.
# ---------------------------------------------------------------------------

NOT_TESTED = [
    # 1.4.3 moved to CHECKS 2026-08-21 -- see the "text-contrast-fail" entry
    # there and contrast_pass.py. 1.4.11 stays here: it is about non-text
    # elements (control borders, focus indicators, icon fills) whose colour
    # and *state* this pass cannot resolve even with a stylesheet, because it
    # needs rendered geometry, not just a declared colour.
    ("1.4.11 Non-text Contrast", "needs rendered control borders and state colours; only text colour against its background is resolved"),
    ("1.4.10 Reflow", "needs a rendered viewport at 320 CSS px"),
    ("1.4.12 Text Spacing", "needs rendering"),
    ("2.1.1 Keyboard", "needs interaction; a static tree cannot show whether a custom control responds to Enter"),
    ("2.1.2 No Keyboard Trap", "needs interaction"),
    ("2.4.7 Focus Visible", "needs rendered focus styles"),
    ("2.4.11 Focus Not Obscured", "needs rendering and scroll position"),
    ("2.5.8 Target Size (Minimum)", "needs rendered box sizes"),
    ("1.3.2 Meaningful Sequence", "needs the rendered reading order, which CSS can reorder"),
    ("1.3.5 Identify Input Purpose", "autocomplete tokens are checkable, but correctness against the field's real purpose is a human judgement"),
    ("3.2.2 On Input", "needs interaction"),
    ("3.3.1 Error Identification", "needs a submitted form"),
    ("3.3.7 Redundant Entry", "needs a multi-step flow"),
    ("4.1.3 Status Messages", "needs runtime behaviour"),
    # Added 2026-08-21. Every one of these is decidable from static markup --
    # axe-core 4.13.0 has at least one rule for each -- and this list named
    # none of them, so a record emitted here was silent about them in exactly
    # the sense `portfolio/research/a11y-engine-agreement/` defines: neither
    # in CHECKS nor here, and so indistinguishable from "checked and passed".
    # The reason strings say "no rule here looks" rather than "needs a human",
    # because these are not the contractor step -- nobody covers them today.
    # See `portfolio/research/a11y-external-coverage-reference/`.
    ("1.2.1 Audio-only and Video-only (Prerecorded)", "a media element with no transcript or alternative is detectable from the markup; no rule here looks"),
    # 1.4.1 moved to CHECKS 2026-08-24 -- see the "color-only-link" entry.
    # 2.2.1, 2.2.2, 3.1.2 moved to CHECKS 2026-08-24 -- see "meta-refresh",
    # "moving-content", "lang-of-parts-invalid". 3.1.1 validity joined the
    # existing existence check the same pass. 2.4.1 and 2.5.3 moved to
    # CHECKS later the same day -- see "bypass-blocks", "label-in-name".
    # 1.3.4 moved to CHECKS the same day -- see "orientation-lock".
    ("Alt text quality", "an alt attribute that is present and non-empty may still describe the wrong thing; only a human can say"),
    ("Assistive-technology outcome", "no static tool establishes whether a real screen reader user can complete checkout"),
]


# ---------------------------------------------------------------------------
# Per-engagement positive control.
#
# A clean findings table is ambiguous: either the page has no static defects,
# or the scanner could not read the page. ``a11y-generated-sites`` named the
# cheap test that separates them -- mutate a copy, check the rule fires --
# and the sibling probe already ships it inside its customer record. This
# engine's ``evidence_record()`` is the same deliverable for templates, and
# until now a clean record from here could not tell those two claims apart.
# The CLI always runs the control. Tests that build a record from a fixture
# may omit it; the section is then absent rather than silently reported as
# passing.
# ---------------------------------------------------------------------------

NOT_EXERCISED = "not_exercised"
CAUGHT = "caught"
MISSED = "missed"
ALREADY_PRESENT = "already_present"

CONTROL_STATEMENT = (
    "A clean findings table is not evidence that this scanner can see defects "
    "on your pages. The rows below introduce a known defect into a copy of "
    "each page and check that the rule fires. 'Caught' means it did. "
    "'Not exercised' means your markup has no such element to edit, or no "
    "place to insert one — the criterion is untested here, not satisfied. "
    "'Already present' means the page already failed that check, so the "
    "mutation could not isolate the engine. 'Missed' means we introduced the "
    "defect and the scanner reported nothing — a clean report on that page "
    "would have been wrong. This control is not a conformance test and not a "
    "claim about any criterion it did not exercise."
)


def _sub_once(pattern: str, repl: str, flags: int = 0):
    def apply(html: str) -> str:
        return re.sub(pattern, repl, html, count=1, flags=flags)

    return apply


def _inject_head(fragment: str):
    def apply(html: str) -> str:
        new, n = re.subn(
            r"<head([^>]*)>", r"<head\1>" + fragment, html, count=1, flags=re.I
        )
        return new if n else html

    return apply


def _inject_body(fragment: str):
    def apply(html: str) -> str:
        new, n = re.subn(
            r"<body([^>]*)>", r"<body\1>" + fragment, html, count=1, flags=re.I
        )
        return new if n else html

    return apply


# (check, criterion, kind, description, mutate)
#
# Targets are this engine's check ids, not the sibling's criterion numbers:
# an unlabelled control is 3.3.2 here and 1.3.1 there, and classifying by
# the shared number would call a 1.3.1-shaped injection a miss on this
# engine even when ``control-no-label`` fired. The mutations themselves
# are the sibling's, so a well-formed page exercises the same defects.
CONTROL_MUTATIONS: tuple = (
    (
        "html-lang-missing", "3.1.1", "removal",
        "drop lang from the <html> element",
        _sub_once(r"""(<html\b[^>]*?)\s+lang=(["'])(?:(?!\2).)*\2""", r"\1", re.I),
    ),
    (
        "title-missing", "2.4.2", "removal",
        "drop the <title> element",
        _sub_once(r"<title\b[^>]*>.*?</title>", "", re.I | re.S),
    ),
    (
        "img-alt-missing", "1.1.1", "removal",
        "drop alt from the first <img>",
        _sub_once(r"""(<img\b[^>]*?)\s+alt=(["'])(?:(?!\2).)*\2""", r"\1", re.I),
    ),
    (
        "button-no-accessible-name", "4.1.2", "injection",
        "add an unnamed <button>",
        _inject_body("<button></button>"),
    ),
    (
        "control-no-label", "3.3.2", "injection",
        "add an unlabelled <input>",
        _inject_body('<input type="text" name="control-probe">'),
    ),
    (
        "link-no-accessible-name", "2.4.4", "injection",
        "add an empty <a href>",
        _inject_body('<a href="/control-probe"></a>'),
    ),
    (
        "viewport-scaling-blocked", "1.4.4", "injection",
        "add a viewport meta that blocks zoom",
        _inject_head(
            '<meta name="viewport" content="width=device-width, '
            'maximum-scale=1, user-scalable=no"/>'
        ),
    ),
    (
        "autoplay-unmuted", "1.4.2", "injection",
        "add an autoplaying <audio> with no muted",
        _inject_body('<audio autoplay src="control-probe.mp3"></audio>'),
    ),
    (
        "media-no-captions", "1.2.2", "injection",
        "add a <video> with no captions track",
        _inject_body('<video src="control-probe.mp4"></video>'),
    ),
    (
        "meta-refresh", "2.2.1", "injection",
        "add a <meta http-equiv=refresh>",
        _inject_head('<meta http-equiv="refresh" content="5"/>'),
    ),
    (
        "color-only-link", "1.4.1", "injection",
        "add a colour-only link inside prose",
        _inject_body(
            '<p style="color:#333">Every order ships within two working '
            "days from our workshop, and you can see "
            '<a href="/control-probe" style="color:#06c;text-decoration:none">'
            "our documentation</a> for the full delivery timetable.</p>"
        ),
    ),
)


def _checks_of(result: dict) -> set:
    return {finding["check"] for finding in result.get("findings") or ()}


def classify_control(original: dict, mutated: dict, check: str) -> str:
    """Verdict for one page after one mutation that actually changed it."""
    new = _checks_of(mutated) - _checks_of(original)
    if check in new:
        return CAUGHT
    if check in _checks_of(mutated):
        return ALREADY_PRESENT
    return MISSED


def _roll_up_control(page_verdicts: list[str]) -> str:
    if not page_verdicts:
        return NOT_EXERCISED
    if CAUGHT in page_verdicts:
        return CAUGHT
    if MISSED in page_verdicts:
        return MISSED
    return ALREADY_PRESENT


def run_control(pages: dict, stylesheet=None) -> dict:
    """Run every mutation against every page.

    ``pages`` maps a page label to its source. The same stylesheet the audit
    used is passed through: a colour-dependent mutation audited without CSS
    (and without inline colours the resolver can read) reports as a miss
    that is really a missing stylesheet.
    """
    originals = {
        label: audit_source(html, label, stylesheet=stylesheet)
        for label, html in pages.items()
    }
    rows = []
    for check, criterion, kind, description, mutate in CONTROL_MUTATIONS:
        page_rows = []
        verdicts = []
        for label, html in pages.items():
            mutated_html = mutate(html)
            if mutated_html == html:
                page_rows.append(
                    {"page": label, "changed": False, "verdict": NOT_EXERCISED}
                )
                continue
            mutated = audit_source(mutated_html, label, stylesheet=stylesheet)
            verdict = classify_control(originals[label], mutated, check)
            verdicts.append(verdict)
            page_rows.append(
                {"page": label, "changed": True, "verdict": verdict}
            )
        rows.append(
            {
                "check": check,
                "criterion": criterion,
                "kind": kind,
                "mutation": description,
                "verdict": _roll_up_control(verdicts),
                "pages_changed": sum(1 for row in page_rows if row["changed"]),
                "pages": page_rows,
            }
        )
    counts = {
        NOT_EXERCISED: 0,
        CAUGHT: 0,
        MISSED: 0,
        ALREADY_PRESENT: 0,
    }
    for row in rows:
        counts[row["verdict"]] += 1
    return {
        "statement": CONTROL_STATEMENT,
        "mutations": rows,
        "counts": counts,
    }


def _control_headline(record: dict) -> str:
    """One line in the header, so a miss is not scroll-dependent."""
    control = record.get("positive_control")
    if not control:
        return ""
    counts = control.get("counts") or {}
    caught = counts.get(CAUGHT, 0)
    missed = counts.get(MISSED, 0)
    exercised = caught + missed + counts.get(ALREADY_PRESENT, 0)
    if missed:
        return (
            f"**Positive control:** {caught} of {exercised} introduced defects "
            f"caught, {missed} missed — a clean findings table would have been "
            "wrong on those. See the section below."
        )
    if exercised == 0:
        return (
            "**Positive control:** none of the mutations could be applied to "
            "these pages, so a clean findings table is unconfirmed."
        )
    return (
        f"**Positive control:** {caught} of {exercised} introduced defects "
        "caught. See the section below."
    )


# ---------------------------------------------------------------------------
# Mechanically determined repairs. Read-only: these are suggestions, never
# writes. The candidate's first experiment is "audit-and-fix"; the audit
# half has been here since 2026-08-20. The one defect class that can be
# repaired without inventing a name or guessing a colour is the fassbender
# forgotten-prefix: a literal <label for> that cannot match any id in its
# file, next to exactly one expression-bearing control id whose trailing
# literal is that for-value after a separator. That is a fact about two
# strings, not a conformance claim, and applying it is a merchant decision.
# ---------------------------------------------------------------------------

FIX_STATEMENT = (
    "The rows below are suggested edits, not applied changes, and not a "
    "claim that the result would conform to WCAG, the European Accessibility "
    "Act, or anything else. Only repairs that are uniquely determined from "
    "the markup are listed. The only class claimed is a literal "
    "<label for> that cannot name any control in its file, paired with "
    "exactly one expression-bearing control id that has that literal as "
    "its trailing text after a separator -- the theme prefixed the control "
    "and forgot the label. Nothing here is written to your files."
)

_ATTR_FIND = re.compile(
    r"""(?P<name>for|id|type)\s*=\s*(?P<q>['"])(?P<val>(?:(?!(?P=q)).)*)(?P=q)""",
    re.I | re.S,
)
_CONTROL_OPEN = re.compile(
    r"""<(?P<tag>input|select|textarea)\b(?P<body>[^>]*)>""",
    re.I | re.S,
)
_LABEL_OPEN = re.compile(
    r"""<label\b(?P<body>[^>]*)>""",
    re.I | re.S,
)
_SEPARATOR_ONLY = re.compile(r"^[\W_]*$")


def _attr_in(body: str, name: str) -> tuple[str, str] | None:
    """Original (quote, value) for `name` inside a start-tag body, or None."""
    for match in _ATTR_FIND.finditer(body):
        if match.group("name").lower() == name:
            return match.group("q"), match.group("val")
    return None


def _control_needs_label(body: str) -> bool:
    found = _attr_in(body, "type")
    if found is None:
        return True
    return expr_free(strip_expressions(found[1])).lower() not in NO_LABEL_TYPES


def _forgotten_prefix(literal_for: str, raw_id: str) -> bool:
    """Is `raw_id` a prefixed form of `literal_for` that can never equal it?"""
    if not literal_for or is_expr(literal_for) or not is_expr(raw_id):
        return False
    if refs_can_match(literal_for, raw_id):
        return False
    last = EXPR_SENTINEL.split(raw_id)[-1]
    if not last.endswith(literal_for):
        return False
    leftover = last[:-len(literal_for)]
    return bool(_SEPARATOR_ONLY.match(leftover))


def suggest_fixes(files: list[tuple[str, str]]) -> list[dict]:
    """File-local, uniquely determined forgotten-prefix repairs.

    Never writes. A one-file or many-file invocation is the same: pairing
    never crosses files, because a ``for`` on another partial may already
    name a different control on that page.
    """
    repairs: list[dict] = []
    for path, source in files:
        labels: list[tuple[str, str, str]] = []
        controls: list[tuple[str, str]] = []
        for match in _LABEL_OPEN.finditer(source):
            found = _attr_in(match.group("body"), "for")
            if found:
                labels.append((found[0], found[1], strip_expressions(found[1])))
        for match in _CONTROL_OPEN.finditer(source):
            if not _control_needs_label(match.group("body")):
                continue
            found = _attr_in(match.group("body"), "id")
            if found:
                controls.append((found[1], strip_expressions(found[1])))

        raw_ids = [stripped for _, stripped in controls]
        dangling = [
            (quote, original, stripped)
            for quote, original, stripped in labels
            if not any(refs_can_match(stripped, raw) for raw in raw_ids)
        ]

        claimed: dict[str, list[tuple[str, str, str]]] = {}
        for quote, original_for, stripped_for in dangling:
            hits = [
                original_id
                for original_id, raw_id in controls
                if _forgotten_prefix(stripped_for, raw_id)
            ]
            if len(hits) != 1:
                continue
            claimed.setdefault(hits[0], []).append(
                (quote, original_for, stripped_for)
            )

        for original_id, claimants in claimed.items():
            if len(claimants) != 1:
                continue
            quote, original_for, _stripped = claimants[0]
            if source.count(f"for={quote}{original_for}{quote}") != 1:
                continue
            repairs.append({
                "file": path,
                "check": "label-for-id-mismatch",
                "success_criterion": CHECKS["label-for-id-mismatch"][0],
                "replace": original_for,
                "with": original_id,
                "replace_attr": f"for={quote}{original_for}{quote}",
                "with_attr": f"for={quote}{original_id}{quote}",
                "reason": (
                    f"this file's <label for={original_for!r}> cannot name "
                    f"any control here, and exactly one control id "
                    f"({original_id!r}) is that literal after a separator"
                ),
            })
    return repairs


def apply_repair(source: str, repair: dict) -> str:
    """Apply one suggested replacement. Used by tests; the CLI never calls it."""
    needle = repair["replace_attr"]
    if source.count(needle) != 1:
        raise ValueError(f"repair is not unique in source: {needle!r}")
    return source.replace(needle, repair["with_attr"], 1)


def _md_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _repairs_section(record: dict) -> list:
    repairs = record.get("proposed_repairs") or []
    if not repairs:
        return []
    lines = [
        "## Proposed repairs (not applied)",
        "",
        record.get("repair_statement", FIX_STATEMENT),
        "",
        f"{len(repairs)} uniquely determined edit(s). None have been written.",
        "",
        "| file | replace | with |",
        "|---|---|---|",
    ]
    for row in repairs:
        lines.append(
            f"| `{_md_cell(row['file'])}` | "
            f"`{_md_cell(row['replace_attr'])}` | "
            f"`{_md_cell(row['with_attr'])}` |"
        )
    lines.append("")
    return lines


def _control_section(record: dict) -> list:
    """The per-engagement control table, placed before the findings."""
    control = record.get("positive_control")
    if not control:
        return []
    counts = control.get("counts") or {}
    lines = [
        "## Positive control",
        "",
        control.get("statement", ""),
        "",
        (
            f"{counts.get(CAUGHT, 0)} caught, "
            f"{counts.get(MISSED, 0)} missed, "
            f"{counts.get(ALREADY_PRESENT, 0)} already present, "
            f"{counts.get(NOT_EXERCISED, 0)} not exercised."
        ),
        "",
        "| Verdict | Criterion | Kind | Mutation |",
        "|---|---|---|---|",
    ]
    for row in control.get("mutations") or []:
        lines.append(
            f"| {row['verdict']} | {row['criterion']} | {row['kind']} | "
            f"{row['mutation']} |"
        )
    lines.append("")
    return lines


def evidence_record(
    results: list[dict],
    scope: str,
    date: str | None = None,
    control: dict | None = None,
    proposed_repairs: list[dict] | None = None,
) -> dict:
    """The deliverable: what was tested, with what, when, and what remains open.

    The coverage boundary is assembled here rather than supplied by the caller,
    so no consumer of this function can publish findings without it.

    ``control`` is the per-engagement positive-control result from
    ``run_control``. The CLI always supplies it. Tests that build a record
    from a single fixture may omit it; the section is then absent rather
    than silently reported as passing.

    ``proposed_repairs`` is the same: the CLI supplies whatever
    ``suggest_fixes`` uniquely determined, which may be an empty list.
    Tests may omit it; absence is not a claim that nothing is fixable.
    """
    findings = [f for r in results for f in r["findings"]]
    undecided = [u for r in results for u in r["undecidable"]]
    by_severity = collections.Counter(f["severity"] for f in findings)
    by_check = collections.Counter(f["check"] for f in findings)
    return {
        "record_type": "accessibility evidence record",
        "not_a_conformance_claim": (
            "This record states what was tested, by what, on what date, and what "
            "was found. It does not state that the subject conforms to WCAG 2.2 "
            "AA, to the European Accessibility Act, or to any other requirement, "
            "and it must not be represented as doing so."
        ),
        "scope": scope,
        "tested_on": date or datetime.date.today().isoformat(),
        "tool": {"name": TOOL, "version": VERSION, "method": "static markup analysis"},
        "files_tested": len(results),
        "elements_examined": sum(r["elements"] for r in results),
        "summary": {
            "findings": len(findings),
            "blocking": by_severity["blocking"],
            "degrading": by_severity["degrading"],
            "undecidable_statically": len(undecided),
            "by_check": dict(by_check.most_common()),
        },
        "findings": findings,
        "open_items": [
            {
                "item": "Undecidable without rendering or data",
                "count": len(undecided),
                "why": (
                    "These are template expressions whose rendered value decides "
                    "the outcome. They are neither passes nor failures and are "
                    "listed so they can be checked against real store data."
                ),
                "detail": undecided,
            },
            {
                "item": "Not tested by this method",
                "count": len(NOT_TESTED),
                "why": (
                    "Static markup analysis cannot reach these. Anything the "
                    "customer needs covered here requires a rendered page and, "
                    "for the last two rows, a person."
                ),
                "detail": [{"criterion": c, "reason": r} for c, r in NOT_TESTED],
            },
        ],
        "positive_control": control,
        "proposed_repairs": proposed_repairs,
        "repair_statement": FIX_STATEMENT if proposed_repairs else None,
    }


def render_record(record: dict) -> str:
    lines = [
        f"# Accessibility evidence record — {record['scope']}",
        "",
        f"**Tested on:** {record['tested_on']}  ",
        f"**Method:** {record['tool']['method']}  ",
        f"**Tool:** `{record['tool']['name']}` v{record['tool']['version']}  ",
        f"**Files tested:** {record['files_tested']} "
        f"({record['elements_examined']} elements)",
        "",
    ]
    headline = _control_headline(record)
    if headline:
        lines += [headline, ""]
    lines += [
        f"> {record['not_a_conformance_claim']}",
        "",
    ]
    lines += _control_section(record)
    lines += _repairs_section(record)
    lines += [
        "## What was found",
        "",
        f"| | count |",
        f"|---|---:|",
        f"| Blocking findings | {record['summary']['blocking']} |",
        f"| Degrading findings | {record['summary']['degrading']} |",
        f"| Undecidable without rendering | {record['summary']['undecidable_statically']} |",
        "",
    ]
    if record["summary"]["by_check"]:
        lines += ["| check | success criterion | severity | n |", "|---|---|---|---:|"]
        for check, count in record["summary"]["by_check"].items():
            sc, severity = CHECKS[check]
            lines.append(f"| `{check}` | {sc} | {severity} | {count} |")
        lines.append("")
    lines += ["## What remains open", ""]
    for item in record["open_items"]:
        lines += [f"### {item['item']} ({item['count']})", "", item["why"], ""]
        if item["item"].startswith("Not tested"):
            lines += ["| criterion | why not |", "|---|---|"]
            lines += [f"| {d['criterion']} | {d['reason']} |" for d in item["detail"]]
            lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def walk(paths: list[str], limit: int | None = None) -> list[str]:
    found: list[str] = []
    for path in paths:
        if os.path.isfile(path):
            found.append(path)
            continue
        for base, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "dist", "vendor")]
            for name in sorted(files):
                if name.endswith(MARKUP_EXT):
                    found.append(os.path.join(base, name))
        if limit and len(found) >= limit:
            break
    return found[:limit] if limit else found


def merge_stylesheets(css_sources: "list[str]"):
    """`wcag_triage.css.Stylesheet` from external CSS file contents.

    Thin re-export of `contrast_pass.merge_stylesheets` so a caller (this
    module's own CLI, `measure_themes.py`) never has to import the sibling
    probe package directly.
    """
    import contrast_pass
    return contrast_pass.merge_stylesheets(css_sources)


def resolve_package_labels(results: list[dict]) -> list[dict]:
    """Re-resolve file-local ``control-no-label`` undecidables against the package.

    ``audit_source`` cannot tell a fragment whose label lives in another
    partial from one that has no label anywhere. Finding 3 of
    ``../a11y-theme-resolution/`` measured that 64 of 69 such cases were in
    the *same* file; the remaining five had no matching ``<label for>`` in
    the package at all -- including the third fassbender defect
    (``theme/templates/search.liquid:22``), which this function is built to
    recover. The same-file half is already handled inside ``audit_source``;
    this is the package-wide half that write-up named and left unbuilt.

    Precision over recall, same as the rest of this module:

    * A certain match (identical raw ``for`` / ``id``, or a literal id
      against a literal ``for``) in any file of the package clears the
      undecidable. The label exists.
    * A possible match (``refs_can_match``) stays undecidable -- two
      expressions could still render equal.
    * No possible match anywhere is a finding. A label in another file
      that cannot name this control is not evidence of a *mismatch* on
      this control (that would confuse one page's dead ``for`` with
      another's unlabelled field); it is simply not a label for it.

    Single-file results are returned unchanged: one file is not a package,
    and promoting "not in this file" to "not in the package" is the
    overclaim a one-file CLI invocation of a fragment must not make.
    """
    if len(results) < 2:
        return results

    package_raw: set[str] = set()
    package_ids: set[str] = set()
    for result in results:
        package_raw.update(result.get("labelling_raw") or ())
        package_ids.update(result.get("labelling_ids") or ())

    for result in results:
        kept: list[dict] = []
        for item in result["undecidable"]:
            if item["check"] != "control-no-label" or "partial" not in item.get("reason", ""):
                kept.append(item)
                continue
            raw_id = item.get("raw_id")
            if not raw_id:
                kept.append(item)
                continue
            shown = expr_free(raw_id) or "<expression>"
            if raw_id in package_raw or (not is_expr(raw_id) and raw_id in package_ids):
                continue
            possible = [target for target in package_raw if refs_can_match(raw_id, target)]
            if possible:
                updated = dict(item)
                updated["reason"] = (
                    f"no <label for={shown!r}> matches for certain in this "
                    f"package; {len(possible)} label(s) in other files could "
                    "match depending on what the template expressions render to"
                )
                kept.append(updated)
                continue
            result["findings"].append(_finding_at(
                "control-no-label",
                item["file"],
                item["line"],
                item["element"],
                f"<{item['element']}> is unlabelled, and no "
                f"<label for={shown!r}> exists anywhere in the package",
            ))
        result["undecidable"] = kept
    return results


def audit_sources(
    files: list[tuple[str, str]], stylesheet=None,
) -> list[dict]:
    """Audit ``(path, source)`` pairs as one package.

    Used by the CLI (via ``audit_paths``) and by ``measure_themes.py``, so
    the package-wide label index cannot drift between the two callers.
    """
    results = []
    for path, source in files:
        try:
            results.append(audit_source(source, path, stylesheet=stylesheet))
        except Exception as exc:  # a malformed template must not stop the pass
            print(f"{path}: parse failed: {exc}", file=sys.stderr)
    return resolve_package_labels(results)


def audit_paths(paths: list[str], limit: int | None = None, stylesheet=None) -> list[dict]:
    files: list[tuple[str, str]] = []
    for path in walk(paths, limit):
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                files.append((path, handle.read()))
        except OSError as exc:
            print(f"{path}: {exc}", file=sys.stderr)
    return audit_sources(files, stylesheet=stylesheet)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("paths", nargs="+", help="files or directories to audit")
    parser.add_argument("--json", help="write the full result set here")
    parser.add_argument("--record", action="store_true", help="print the evidence record as Markdown")
    parser.add_argument("--scope", default="unnamed subject", help="what was tested, for the record")
    parser.add_argument("--date", default=None, help="ISO date to stamp the record with")
    parser.add_argument("--limit", type=int, default=None, help="stop after N files")
    parser.add_argument(
        "--stylesheet", action="append", default=[],
        help="external CSS file this corpus is built from, for 1.4.3; repeatable")
    args = parser.parse_args()

    sheet = None
    if args.stylesheet:
        css_sources = []
        for css_path in args.stylesheet:
            with open(css_path, encoding="utf-8", errors="ignore") as handle:
                css_sources.append(handle.read())
        sheet = merge_stylesheets(css_sources)

    files: list[tuple[str, str]] = []
    for path in walk(args.paths, args.limit):
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                files.append((path, handle.read()))
        except OSError as exc:
            print(f"{path}: {exc}", file=sys.stderr)
    results = audit_sources(files, stylesheet=sheet)
    control = run_control({path: source for path, source in files}, stylesheet=sheet)
    record = evidence_record(
        results, args.scope, args.date,
        control=control,
        proposed_repairs=suggest_fixes(files),
    )

    if args.record:
        print(render_record(record))
    else:
        print(json.dumps(record["summary"], indent=2))

    if args.json:
        with open(args.json, "w") as handle:
            json.dump({"record": record, "per_file": results}, handle, indent=1)
        print(f"\nwrote {args.json}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
