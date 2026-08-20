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

No third-party dependencies; standard library only. Reads files, writes only
where told to.
"""

from __future__ import annotations

import argparse
import collections
import datetime
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
EXPR = "\x00expr\x00"
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


def strip_expressions(text: str) -> str:
    for pattern in EXPR_SYNTAX:
        text = pattern.sub(EXPR, text)
    return text


def is_expr(value: str | None) -> bool:
    return bool(value) and EXPR in value


def expr_free(value: str | None) -> str:
    """The literal part of an attribute value, with expressions removed."""
    return (value or "").replace(EXPR, "").strip()


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
        cleaned = data.replace(EXPR, " ").strip()
        if cleaned:
            self.stack[-1].text_parts.append(cleaned)
        elif EXPR in data:
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
    "title-missing":         ("2.4.2 Page Titled", "degrading"),
    "iframe-no-title":       ("4.1.2 Name, Role, Value", "blocking"),
    "aria-reference-broken": ("1.3.1 Info and Relationships", "blocking"),
    "label-for-broken":      ("3.3.2 Labels or Instructions", "blocking"),
    "duplicate-referenced-id": ("1.3.1 Info and Relationships", "blocking"),
    "positive-tabindex":     ("2.4.3 Focus Order", "blocking"),
    "viewport-scaling-blocked": ("1.4.4 Resize Text", "blocking"),
    "autoplay-unmuted":      ("1.4.2 Audio Control", "blocking"),
    "data-table-no-header":  ("1.3.1 Info and Relationships", "degrading"),
    "heading-level-skipped": ("1.3.1 Info and Relationships", "degrading"),
}

FILENAME_ALT = re.compile(
    r"^[\w\-. ]+\.(?:jpe?g|png|gif|svg|webp|avif|bmp|ico)$", re.I
)

LABELLABLE = {"input", "select", "textarea"}
NO_LABEL_TYPES = {"hidden", "submit", "reset", "button", "image"}


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


def _finding(kind, node, detail, source):
    sc, severity = CHECKS[kind]
    return {
        "check": kind,
        "success_criterion": sc,
        "severity": severity,
        "file": source,
        "line": node.line,
        "element": node.tag,
        "detail": detail,
    }


def _undecidable(kind, node, reason, source):
    return {
        "check": kind,
        "success_criterion": CHECKS[kind][0],
        "file": source,
        "line": node.line,
        "element": node.tag,
        "reason": reason,
    }


def audit_source(source: str, path: str = "<string>") -> dict:
    """Audit one template. Returns findings, undecidables, and element counts."""
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
    is_fragment = by_tag.get("html", 0) == 0

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
                node_id = expr_free(node.attr("id"))
                wrapped = False
                ancestor = node.parent
                while ancestor is not None:
                    if ancestor.tag == "label":
                        wrapped = True
                        break
                    ancestor = ancestor.parent
                if not labelled and not wrapped:
                    if node_id:
                        # Resolved after the pass, once every <label for> is known.
                        node.attrs["__needs_label_for"] = node_id
                    elif is_expr(node.attr("id")):
                        undecided.append(_undecidable(
                            "control-no-label", node,
                            "control id is a template expression, so a matching "
                            "<label for> cannot be resolved statically", path))
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

        # --- 1.4.2 audio ----------------------------------------------------
        if node.tag in ("video", "audio") and node.has_attr("autoplay"):
            if not node.has_attr("muted"):
                findings.append(_finding(
                    "autoplay-unmuted", node,
                    f"<{node.tag} autoplay> without muted starts sound the user "
                    "did not ask for and cannot easily stop", path))

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

    # --- resolve label/aria references now that every id is known -----------
    known_ids = set(tree.ids)
    for node in nodes:
        pending = node.attrs.get("__needs_label_for")
        if pending is not None:
            del node.attrs["__needs_label_for"]
            if pending in labelling_ids:
                continue
            if is_fragment:
                undecided.append(_undecidable(
                    "control-no-label", node,
                    f"no <label for={pending!r}> in this file; the label may live "
                    "in another partial of the same page", path))
            else:
                findings.append(_finding(
                    "control-no-label", node,
                    f"no <label for={pending!r}> anywhere in the document", path))

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
    ("1.4.3 Contrast (Minimum)", "needs rendered colours; stylesheets, theme settings and images all participate"),
    ("1.4.11 Non-text Contrast", "same reason"),
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
    ("Alt text quality", "an alt attribute that is present and non-empty may still describe the wrong thing; only a human can say"),
    ("Assistive-technology outcome", "no static tool establishes whether a real screen reader user can complete checkout"),
]


def evidence_record(results: list[dict], scope: str, date: str | None = None) -> dict:
    """The deliverable: what was tested, with what, when, and what remains open.

    The coverage boundary is assembled here rather than supplied by the caller,
    so no consumer of this function can publish findings without it.
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
        f"> {record['not_a_conformance_claim']}",
        "",
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


def audit_paths(paths: list[str], limit: int | None = None) -> list[dict]:
    results = []
    for path in walk(paths, limit):
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                source = handle.read()
        except OSError as exc:
            print(f"{path}: {exc}", file=sys.stderr)
            continue
        try:
            results.append(audit_source(source, path))
        except Exception as exc:  # a malformed template must not stop the pass
            print(f"{path}: parse failed: {exc}", file=sys.stderr)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("paths", nargs="+", help="files or directories to audit")
    parser.add_argument("--json", help="write the full result set here")
    parser.add_argument("--record", action="store_true", help="print the evidence record as Markdown")
    parser.add_argument("--scope", default="unnamed subject", help="what was tested, for the record")
    parser.add_argument("--date", default=None, help="ISO date to stamp the record with")
    parser.add_argument("--limit", type=int, default=None, help="stop after N files")
    args = parser.parse_args()

    results = audit_paths(args.paths, args.limit)
    record = evidence_record(results, args.scope, args.date)

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
