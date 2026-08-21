"""Static WCAG 2.2 A/AA triage probe for the EAA remediation candidate."""

from .contrast import ContrastResult, evaluate_document
from .css import Stylesheet, parse_stylesheet
from .engine import Audit, audit_html
from .rules import BLOCKING, DEGRADING, COVERAGE, Finding

__all__ = [
    "Audit",
    "audit_html",
    "BLOCKING",
    "DEGRADING",
    "COVERAGE",
    "Finding",
    "ContrastResult",
    "evaluate_document",
    "Stylesheet",
    "parse_stylesheet",
]
