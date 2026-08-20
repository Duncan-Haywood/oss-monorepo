"""Static WCAG 2.2 A/AA triage probe for the EAA remediation candidate."""

from .engine import Audit, audit_html
from .rules import BLOCKING, DEGRADING, COVERAGE, Finding

__all__ = ["Audit", "audit_html", "BLOCKING", "DEGRADING", "COVERAGE", "Finding"]
