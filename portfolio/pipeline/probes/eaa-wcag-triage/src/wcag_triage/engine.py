"""Run every rule over a parsed document and return the findings.

The engine's only real job beyond dispatch is the thing the parent candidate
sells: sorting the results into what *blocks* a task and what merely *degrades*
one. That split lives on each :class:`~wcag_triage.rules.Finding` (its
``impact``), assigned where the rule has the context to assign it, and the
engine just tallies it.

It carries one thing besides findings: the **contrast decidability tally**. SC
1.4.3 is the only criterion this probe evaluates where "could not tell" is a
per-element outcome rather than a property of the rule, so the count of elements
it decided and the reasons it could not decide the rest are measured evidence
about how much manual review a page actually needs — and they go in the evidence
record for that reason.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from . import contrast
from .css import Stylesheet
from .parser import parse
from .rules import ALL_RULES, BLOCKING, DEGRADING, Finding, build_label_index, rule_text_contrast


@dataclass
class Audit:
    findings: list = field(default_factory=list)
    # verdict -> count, plus "reasons": {reason: count}. See `contrast_tally`.
    contrast: dict = field(default_factory=dict)

    @property
    def blocking(self) -> list:
        return [f for f in self.findings if f.impact == BLOCKING]

    @property
    def degrading(self) -> list:
        return [f for f in self.findings if f.impact == DEGRADING]

    def counts(self) -> dict:
        return {
            "total": len(self.findings),
            "blocking": len(self.blocking),
            "degrading": len(self.degrading),
        }


def contrast_tally(results: list) -> dict:
    """Summarise per-element 1.4.3 verdicts into the record's tally."""
    tally = {"pass": 0, "fail": 0, "undecidable": 0, "reasons": {}}
    for _, result in results:
        tally[result.verdict] += 1
        if result.verdict == contrast.UNDECIDABLE:
            tally["reasons"][result.reason] = tally["reasons"].get(result.reason, 0) + 1
    decided = tally["pass"] + tally["fail"]
    total = decided + tally["undecidable"]
    tally["elements"] = total
    tally["decidable_share"] = round(decided / total, 4) if total else None
    return tally


def audit_html(html: str, stylesheet: Optional[Stylesheet] = None) -> Audit:
    """Audit one page.

    ``stylesheet`` is the page's *linked* CSS, already parsed — the caller has
    to resolve `<link href>` against a filesystem or a site, which this module
    deliberately does not do. Any `<style>` block in the page itself is read
    here and layered on top. With no stylesheet at all the colour rules simply
    find nothing to decide, and the tally says so rather than the record
    implying the page was checked for contrast.
    """
    root = parse(html)
    label_targets = build_label_index(root)
    sheet = contrast.stylesheet_for(root, stylesheet)
    findings: list = []
    seen = set()
    for rule in ALL_RULES:
        for finding in rule(root, label_targets):
            if finding.key() in seen:
                continue
            seen.add(finding.key())
            findings.append(finding)
    contrast_results = contrast.evaluate_document(root, sheet)
    for finding in rule_text_contrast(contrast_results):
        if finding.key() in seen:
            continue
        seen.add(finding.key())
        findings.append(finding)
    # Blocking first, then by document order.
    findings.sort(key=lambda f: (0 if f.impact == BLOCKING else 1, f.line))
    return Audit(findings=findings, contrast=contrast_tally(contrast_results))
