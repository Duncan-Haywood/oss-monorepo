"""Built-in rules that step aside for PINT and ZATCA invoices; mirrors aside.mjs.

The built-in INV-0xx checks assume EU conventions (IBANs, BICs, EU VAT numbers, EU
exemption reasons). On a Peppol PINT (Singapore, Australia/New Zealand, Japan,
Malaysia, UAE, Oman) or ZATCA invoice they fire falsely, so the CLI drops them as the
browser checker does, read from BT-24 (CustomizationID) and the UBL ProfileID.
tests/test_js_parity.py compares this table with aside.mjs.
"""

from __future__ import annotations

import re
from typing import Any

_PINT = re.compile(r"poacc:(?:billing|selfbilling):international:(?:sg|aunz):|^\s*urn:peppol:pint:", re.I)
_PINT_LOCAL = re.compile(r"^\s*urn:peppol:pint:[a-z]+-1@(?:jp|my|ae|om)-1\b", re.I)
_PINT_JP_NTR = re.compile(r"^\s*urn:peppol:pint:nontaxinvoice-1@jp-1\b", re.I)
_PINT_AE = re.compile(r"^\s*urn:peppol:pint:[a-z]+-1@ae-1\b", re.I)
_ZATCA = re.compile(r"^\s*(?:reporting|clearance):1\.0\s*$", re.I)

ASIDE = {
    "pint": ["INV-024", "INV-026", "INV-044", "INV-035"],
    "local": ["INV-022", "INV-027", "INV-034"],
    "jpNtr": ["INV-018", "INV-038"],
    "aeZeroAtRate": ["INV-018", "INV-038"],
    "zatca": ["INV-024", "INV-022", "INV-005", "INV-006", "INV-034", "INV-045", "INV-052"],
}


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _zero_at_rate(row: Any) -> bool:
    if not isinstance(row, dict):
        return False
    return (
        str(row.get("tax_category") or "").upper() in ("AE", "N")
        and _number(row.get("tax")) == 0
        and _number(row.get("tax_percent")) > 0
    )


def stepped_aside(invoice: Any) -> set[str]:
    """Rule ids the built-in checks should not report for this invoice's profile."""
    if not isinstance(invoice, dict):
        return set()
    spec = str(invoice.get("specification_id") or "")
    profile = str(invoice.get("profile_id") or "")
    out: set[str] = set()
    if _PINT.search(spec):
        out.update(ASIDE["pint"])
    if _PINT_LOCAL.search(spec):
        out.update(ASIDE["local"])
    if _PINT_JP_NTR.search(spec):
        out.update(ASIDE["jpNtr"])
    breakdown = invoice.get("tax_breakdown") or []
    if _PINT_AE.search(spec) and isinstance(breakdown, list) and any(_zero_at_rate(r) for r in breakdown):
        out.update(ASIDE["aeZeroAtRate"])
    if _ZATCA.search(profile):
        out.update(ASIDE["zatca"])
    return out
