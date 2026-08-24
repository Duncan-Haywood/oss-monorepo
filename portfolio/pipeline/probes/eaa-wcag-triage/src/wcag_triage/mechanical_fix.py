"""Apply only mechanical, non-invented patches and re-audit the page.

The parent candidate's first experiment asks how many blocking issues
generated fixes close. Live shop themes and a contractor are still required
for that number. This module is the software half of that experiment: it
rewrites the markup the engine already understands, then runs the same
engine again.

It refuses to invent meaning. Alt text, visible labels, captions, link
names, button names, and a page language are content. Inventing them would
make the findings table shorter in the direction that pays the operator.
The patches here are the ones that do not add words:

- derive a ``<title>`` from the first heading that already has text
- close a heading-level skip by changing the heading number, not the words
- remove ``aria-hidden`` from a focusable control (the control already
  has a name, or a different rule would have said so)
- drop a zoom-lock on the viewport meta
- rewrite a dead ``<label for>`` onto the unique expression-prefixed
  control id that already ends with that literal (forgotten-prefix).
  A search field with no label in the file is still skipped: there is
  no ``for`` to rewrite, and inventing a name is content.

A low close rate on blocking findings is a result, not a bug. The
remainder is the contractor step.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html import escape
from typing import Optional

from .engine import Audit, audit_html
from .expressions import (
    EXPR_SENTINEL,
    expr_free,
    is_expr,
    refs_can_match,
    strip_expressions,
)
from .parser import parse
from .rules import Finding

_INTERACTIVE = frozenset({"a", "button", "input", "select", "textarea"})
_NO_LABEL_TYPES = frozenset({"hidden"})
_ATTR_FIND = re.compile(
    r"""(?P<name>[A-Za-z_:][-\w:.]*)\s*=\s*(?P<q>['"])(?P<val>(?:(?!(?P=q)).)*)(?P=q)""",
    re.I | re.S,
)
_CONTROL_OPEN = re.compile(
    r"""<(?P<tag>input|select|textarea)\b(?P<body>[^>]*)>""",
    re.I | re.S,
)
_LABEL_OPEN = re.compile(r"""<label\b(?P<body>[^>]*)>""", re.I | re.S)
_SEPARATOR_ONLY = re.compile(r"^[\W_]*$")
_MISMATCH_MARK = "dead in the rendered page"

LIMITS = (
    "Fixture or supplied markup, not a live shop theme.",
    "Re-audit by the same static engine, not assistive-technology verification.",
    "Does not settle the candidate's kill criterion (that needs live themes "
    "and a contractor).",
    "Does not invent alt text, labels, captions, link names, button names, "
    "or a page language.",
)

_SKIP_REASONS = {
    "3.1.1": "inventing a page language is a claim the markup does not support",
    "1.1.1": "alt text is content; this pass will not invent it",
    "1.3.1": "a control label is content; this pass will not invent it",
    "2.4.4": "a link name is content; this pass will not invent it",
    "1.2.2": "captions are content; this pass will not invent them",
}


@dataclass
class AppliedPatch:
    criterion: str
    impact: str
    action: str


@dataclass
class SkippedFinding:
    criterion: str
    impact: str
    reason: str


@dataclass
class FixPass:
    html: str
    before: Audit
    after: Audit
    applied: list = field(default_factory=list)
    skipped: list = field(default_factory=list)

    def counts(self) -> dict:
        before = self.before.counts()
        after = self.after.counts()
        closed = {
            "total": before["total"] - after["total"],
            "blocking": before["blocking"] - after["blocking"],
            "degrading": before["degrading"] - after["degrading"],
        }
        return {"before": before, "after": after, "closed": closed}

    def blocking_close_rate(self) -> Optional[float]:
        before = self.before.counts()["blocking"]
        if before == 0:
            return None
        return (before - self.after.counts()["blocking"]) / before


def skip_reason(finding: Finding) -> str:
    if finding.criterion == "4.1.2" and "aria-hidden" not in finding.message:
        return "a control name is content; this pass will not invent it"
    if finding.criterion == "1.3.1" and _MISMATCH_MARK in finding.message:
        return (
            "no unique forgotten-prefix pairing in this file; "
            "this pass will not invent a label"
        )
    return _SKIP_REASONS.get(
        finding.criterion,
        "no mechanical rewrite exists for this finding",
    )


def try_patch(html: str, finding: Finding) -> tuple[Optional[str], str]:
    """Return ``(new_html, action)`` or ``(None, skip_reason)``."""
    if finding.criterion == "2.4.2":
        nxt = _add_title_from_h1(html)
        if nxt is not None:
            return nxt, "derived <title> from the first heading's existing text"
    if finding.criterion == "2.4.6":
        nxt = _renumber_skipped_heading(html, finding)
        if nxt is not None:
            return nxt, "closed a heading-level skip without changing the words"
    if finding.criterion == "4.1.2" and "aria-hidden" in finding.message:
        nxt = _remove_aria_hidden_from_interactive(html, finding)
        if nxt is not None:
            return nxt, "removed aria-hidden from a focusable control"
    if finding.criterion == "1.4.4":
        nxt = _relax_viewport(html)
        if nxt is not None:
            return nxt, "removed the viewport zoom-lock"
    if finding.criterion == "1.3.1" and _MISMATCH_MARK in finding.message:
        nxt = _rewrite_forgotten_prefix(html)
        if nxt is not None:
            return nxt, (
                "rewrote a dead <label for> onto the unique "
                "expression-prefixed control id"
            )
    return None, skip_reason(finding)


def apply_mechanical_fixes(html: str) -> FixPass:
    """Patch what can be patched without inventing content, then re-audit."""
    before = audit_html(html)
    current = html
    applied: list[AppliedPatch] = []
    while True:
        audit = audit_html(current)
        progressed = False
        for finding in audit.findings:
            nxt, action = try_patch(current, finding)
            if nxt is None:
                continue
            current = nxt
            applied.append(
                AppliedPatch(
                    criterion=finding.criterion,
                    impact=finding.impact,
                    action=action,
                )
            )
            progressed = True
            break
        if not progressed:
            break
    after = audit_html(current)
    skipped = [
        SkippedFinding(
            criterion=f.criterion,
            impact=f.impact,
            reason=skip_reason(f),
        )
        for f in after.findings
    ]
    return FixPass(
        html=current,
        before=before,
        after=after,
        applied=applied,
        skipped=skipped,
    )


def summarise_close_rate(passes: list[FixPass], pages: list[str]) -> dict:
    """Aggregate close-rate figures across pages. Every number is derived."""
    before_total = after_total = 0
    before_blocking = after_blocking = 0
    before_degrading = after_degrading = 0
    per_page = []
    for name, result in zip(pages, passes):
        counts = result.counts()
        before_total += counts["before"]["total"]
        after_total += counts["after"]["total"]
        before_blocking += counts["before"]["blocking"]
        after_blocking += counts["after"]["blocking"]
        before_degrading += counts["before"]["degrading"]
        after_degrading += counts["after"]["degrading"]
        per_page.append(
            {
                "page": name,
                **counts,
                "blocking_close_rate": result.blocking_close_rate(),
                "applied": [p.__dict__ for p in result.applied],
                "skipped": [s.__dict__ for s in result.skipped],
            }
        )
    return {
        "before": {
            "total": before_total,
            "blocking": before_blocking,
            "degrading": before_degrading,
        },
        "after": {
            "total": after_total,
            "blocking": after_blocking,
            "degrading": after_degrading,
        },
        "closed": {
            "total": before_total - after_total,
            "blocking": before_blocking - after_blocking,
            "degrading": before_degrading - after_degrading,
        },
        "blocking_close_rate": (
            None
            if before_blocking == 0
            else (before_blocking - after_blocking) / before_blocking
        ),
        "pages": per_page,
        "limits": list(LIMITS),
    }


def _add_title_from_h1(html: str) -> Optional[str]:
    root = parse(html)
    if any(n.tag == "title" and n.accessible_text() for n in root.iter()):
        return None
    h1s = [n for n in root.iter() if n.tag == "h1" and n.accessible_text()]
    if not h1s:
        return None
    title = escape(h1s[0].accessible_text(), quote=False)
    empty = re.search(r"<title\b[^>]*>\s*</title>", html, flags=re.I)
    if empty:
        return html[: empty.start()] + f"<title>{title}</title>" + html[empty.end() :]
    head = re.search(r"<head\b[^>]*>", html, flags=re.I)
    if not head:
        return None
    return html[: head.end()] + f"\n  <title>{title}</title>" + html[head.end() :]


def _renumber_skipped_heading(html: str, finding: Finding) -> Optional[str]:
    root = parse(html)
    headings = [
        (int(n.tag[1]), n)
        for n in root.iter()
        if len(n.tag) == 2 and n.tag[0] == "h" and n.tag[1] in "123456"
    ]
    previous = 0
    for level, node in headings:
        if node.order == finding.seq:
            if not previous or level <= previous + 1:
                return None
            return _rewrite_heading_on_line(
                html, node.line, level, previous + 1
            )
        previous = level
    return None


def _rewrite_heading_on_line(
    html: str, line_no: int, from_level: int, to_level: int
) -> Optional[str]:
    lines = html.splitlines(keepends=True)
    if line_no < 1 or line_no > len(lines):
        return None
    idx = line_no - 1
    line = lines[idx]
    open_pat = rf"<h{from_level}\b"
    close_pat = rf"</h{from_level}>"
    if not re.search(open_pat, line) or not re.search(close_pat, line, flags=re.I):
        return None
    line = re.sub(open_pat, f"<h{to_level}", line, count=1)
    line = re.sub(close_pat, f"</h{to_level}>", line, count=1, flags=re.I)
    lines[idx] = line
    return "".join(lines)


def _remove_aria_hidden_from_interactive(
    html: str, finding: Finding
) -> Optional[str]:
    if finding.element not in _INTERACTIVE:
        return None
    lines = html.splitlines(keepends=True)
    if finding.line < 1 or finding.line > len(lines):
        return None
    idx = finding.line - 1
    pat = rf'(<{finding.element}\b[^>]*?)\s+aria-hidden=(["\'])true\2'
    new, n = re.subn(pat, r"\1", lines[idx], count=1, flags=re.I)
    if n != 1:
        return None
    lines[idx] = new
    return "".join(lines)


def _relax_viewport(html: str) -> Optional[str]:
    pattern = re.compile(
        r'<meta\b[^>]*\bname=["\']viewport["\'][^>]*>',
        flags=re.I,
    )
    match = pattern.search(html)
    if not match:
        return None
    tag = match.group(0)
    content_match = re.search(
        r'\bcontent=(["\'])(.*?)\1', tag, flags=re.I | re.DOTALL
    )
    if not content_match:
        return None
    parts = [p.strip() for p in content_match.group(2).split(",") if p.strip()]
    kept = []
    changed = False
    for part in parts:
        key, _, val = part.partition("=")
        key = key.strip().lower()
        val = val.strip()
        if key == "user-scalable" and val.lower() in {"no", "0"}:
            changed = True
            continue
        if key == "maximum-scale":
            try:
                if float(val) < 2:
                    changed = True
                    continue
            except ValueError:
                pass
        kept.append(part)
    if not changed:
        return None
    quote = content_match.group(1)
    new_tag = (
        tag[: content_match.start()]
        + f"content={quote}{', '.join(kept)}{quote}"
        + tag[content_match.end() :]
    )
    return html[: match.start()] + new_tag + html[match.end() :]


def _attr_in(body: str, name: str) -> tuple[str, str] | None:
    """Original (quote, value) for ``name`` inside a start-tag body."""
    for match in _ATTR_FIND.finditer(body):
        if match.group("name").lower() == name:
            return match.group("q"), match.group("val")
    return None


def _control_needs_label(body: str) -> bool:
    found = _attr_in(body, "type")
    if found is None:
        return True
    return expr_free(strip_expressions(found[1])).lower() not in _NO_LABEL_TYPES


def _forgotten_prefix(literal_for: str, raw_id: str) -> bool:
    """Is ``raw_id`` a prefixed form of ``literal_for`` that can never equal it?"""
    if not literal_for or is_expr(literal_for) or not is_expr(raw_id):
        return False
    if refs_can_match(literal_for, raw_id):
        return False
    last = EXPR_SENTINEL.split(raw_id)[-1]
    if not last.endswith(literal_for):
        return False
    leftover = last[: -len(literal_for)]
    return bool(_SEPARATOR_ONLY.match(leftover))


def _rewrite_forgotten_prefix(html: str) -> Optional[str]:
    """Rewrite each uniquely determined dead ``for`` onto its prefixed id.

    Same pairing rule as ``audit.py``'s ``suggest_fixes``: a literal
    ``<label for>`` that cannot match any id here, next to exactly one
    expression-bearing control id whose trailing literal is that
    ``for`` value after a separator. Ambiguous suffixes, labels that
    could still render equal, and a control with no label in the file
    are left alone.
    """
    labels = []
    controls = []
    for match in _LABEL_OPEN.finditer(html):
        found = _attr_in(match.group("body"), "for")
        if found:
            labels.append((found[0], found[1], strip_expressions(found[1])))
    for match in _CONTROL_OPEN.finditer(html):
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

    claimed: dict[str, list[tuple[str, str]]] = {}
    for quote, original_for, stripped_for in dangling:
        hits = [
            original_id
            for original_id, raw_id in controls
            if _forgotten_prefix(stripped_for, raw_id)
        ]
        if len(hits) != 1:
            continue
        claimed.setdefault(hits[0], []).append((quote, original_for))

    updated = html
    changed = False
    for original_id, claimants in claimed.items():
        if len(claimants) != 1:
            continue
        quote, original_for = claimants[0]
        # Match the same attribute spelling accepted by _attr_in. HTML
        # attributes are case-insensitive and whitespace around '=' is valid.
        needle = re.compile(
            rf"(?P<prefix>\bfor\s*=\s*{re.escape(quote)})"
            rf"{re.escape(original_for)}{re.escape(quote)}",
            re.I,
        )
        if len(needle.findall(updated)) != 1:
            continue
        updated = needle.sub(
            lambda match: (
                f"{match.group('prefix')}{original_id}{quote}"
            ),
            updated,
            count=1,
        )
        changed = True
    return updated if changed else None
