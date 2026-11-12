"""EU-only checks a PINT or ZATCA invoice trips falsely, as report.mjs drops them.

The built-in INV-0xx checks assume EU conventions. A file whose CustomizationID
(BT-24) names a Peppol PINT profile, or whose ProfileID names ZATCA, carries its
own rules instead, and OpenPeppol's own examples fail several EU ones for reasons
that are right in Japan or Singapore: a JP T-number is no EU VAT number (INV-022),
a Singapore account is no IBAN (INV-024). The browser checker dropped these only
when it ran the official rules; the CLI never did (red team 2026-11-12). The
profile table mirrors PROFILES in schematron-core.mjs and the drop list mirrors
ownProfileDrops in report.mjs; tests/test_js_parity.py compares both.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

# (name, CustomizationID pattern, ProfileID pattern), in schematron-core.mjs order.
PROFILES: list[tuple[str, re.Pattern[str] | None, re.Pattern[str] | None]] = [
    ("pint-sg", re.compile(r"poacc:billing:international:sg:", re.I), None),
    ("pint-aunz", re.compile(r"poacc:billing:international:aunz:", re.I), None),
    ("zatca", None, re.compile(r"^\s*(?:reporting|clearance):1\.0\s*$", re.I)),
    ("pint-aunz-sb", re.compile(r"poacc:selfbilling:international:aunz:", re.I), None),
    ("pint-sg-1", re.compile(r"^\s*urn:peppol:pint:billing-1@sg-1\b", re.I), None),
    ("pint-aunz-1", re.compile(r"^\s*urn:peppol:pint:billing-1@aunz-1\b", re.I), None),
    ("pint-aunz-sb-1", re.compile(r"^\s*urn:peppol:pint:selfbilling-1@aunz-1\b", re.I), None),
    ("pint-jp-1", re.compile(r"^\s*urn:peppol:pint:billing-1@jp-1\b", re.I), None),
    ("pint-jp-ntr-1", re.compile(r"^\s*urn:peppol:pint:nontaxinvoice-1@jp-1\b", re.I), None),
    ("pint-jp-sb-1", re.compile(r"^\s*urn:peppol:pint:selfbilling-1@jp-1\b", re.I), None),
    ("pint-my-1", re.compile(r"^\s*urn:peppol:pint:billing-1@my-1\b", re.I), None),
    ("pint-my-sb-1", re.compile(r"^\s*urn:peppol:pint:selfbilling-1@my-1\b", re.I), None),
    ("pint-ae-1", re.compile(r"^\s*urn:peppol:pint:billing-1@ae-1\b", re.I), None),
    ("pint-ae-sb-1", re.compile(r"^\s*urn:peppol:pint:selfbilling-1@ae-1\b", re.I), None),
    ("pint-om-1", re.compile(r"^\s*urn:peppol:pint:billing-1@om-1\b", re.I), None),
    ("pint-om-sb-1", re.compile(r"^\s*urn:peppol:pint:selfbilling-1@om-1\b", re.I), None),
]

_CUSTOMIZATION = re.compile(r"<(?:\w+:)?CustomizationID\b[^>]*>([^<]*)<")
_PROFILE_ID = re.compile(r"<(?:\w+:)?ProfileID\b[^>]*>([^<]*)<")
_UBL_ROOT = re.compile(r"<(?:\w+:)?(?:Invoice|CreditNote)\b")
_CII_ROOT = re.compile(r"<(?:\w+:)?CrossIndustryInvoice\b")


def matching_profile(xml: bytes | str) -> str | None:
    """The PINT/ZATCA profile a UBL file names, or None (all of them are UBL only)."""
    text = xml.decode("utf-8", "replace") if isinstance(xml, bytes) else xml
    if _CII_ROOT.search(text) or not _UBL_ROOT.search(text):
        return None
    found = _CUSTOMIZATION.search(text)
    customization = found.group(1) if found else ""
    found = _PROFILE_ID.search(text)
    profile_id = found.group(1) if found else ""
    for name, by_customization, by_profile in PROFILES:
        if (by_customization and by_customization.search(customization)) or (by_profile and by_profile.search(profile_id)):
            return name
    return None


def own_profile_drops(sets: Iterable[str], invoice: dict[str, Any]) -> set[str]:
    """Rule ids report.mjs's ownProfileDrops drops under these profile names."""
    sets = list(sets)
    drop = {"INV-024"}
    if any(s.startswith("pint") for s in sets):
        drop |= {"INV-026", "INV-044", "INV-035"}
    if any(re.match(r"pint-(jp|my|ae|om)-", s) for s in sets):
        drop |= {"INV-022", "INV-027", "INV-034"}
    if "pint-jp-ntr-1" in sets:
        drop |= {"INV-018", "INV-038"}
    rows = [row for row in invoice.get("tax_breakdown") or [] if isinstance(row, dict)]

    def zero_at_rate(row: dict[str, Any]) -> bool:
        try:
            return str(row.get("tax_category") or "").upper() in {"AE", "N"} and float(row.get("tax")) == 0 and float(row.get("tax_percent")) > 0
        except (TypeError, ValueError):
            return False

    if any(s.startswith("pint-ae-") for s in sets) and any(zero_at_rate(row) for row in rows):
        drop |= {"INV-018", "INV-038"}
    if any(row.get("tax_scheme") and row.get("tax_percent") in (None, "") for row in rows):
        drop |= {"INV-018", "INV-038"}
    if any(s.startswith("zatca") for s in sets):
        drop |= {"INV-022", "INV-005", "INV-006", "INV-034", "INV-045", "INV-052"}
    return drop
