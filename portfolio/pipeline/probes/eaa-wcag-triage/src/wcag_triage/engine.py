"""Run every rule over a parsed document and return the findings.

The engine's only real job beyond dispatch is the thing the parent candidate
sells: sorting the results into what *blocks* a task and what merely *degrades*
one. That split lives on each :class:`~wcag_triage.rules.Finding` (its
``impact``), assigned where the rule has the context to assign it, and the
engine just tallies it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .parser import parse
from .rules import ALL_RULES, BLOCKING, DEGRADING, Finding, build_label_index


@dataclass
class Audit:
    findings: list = field(default_factory=list)

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


def audit_html(html: str) -> Audit:
    root = parse(html)
    label_targets = build_label_index(root)
    findings: list = []
    seen = set()
    for rule in ALL_RULES:
        for finding in rule(root, label_targets):
            if finding.key() in seen:
                continue
            seen.add(finding.key())
            findings.append(finding)
    # Blocking first, then by document order.
    findings.sort(key=lambda f: (0 if f.impact == BLOCKING else 1, f.line))
    return Audit(findings=findings)
