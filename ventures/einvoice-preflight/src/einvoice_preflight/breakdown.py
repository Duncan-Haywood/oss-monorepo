"""Offline mixed-rate tax-breakdown observations.

Peppol and many EN 16931 CIUS require a TaxSubtotal per rate when an
invoice mixes standard, reduced, and zero-rated lines. An ERP export
that only carries a header tax total is a common rejection after the
bookkeeper already sent the file. This is arithmetic and document-shape
checking, not a tax-law determination and not a claim that a rate is
correct. Findings never repeat invoice numbers or line descriptions.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any


def inspect_tax_breakdown(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-037 / INV-038 observations for tax_breakdown."""
    if not isinstance(invoice, dict):
        return []
    expected = _line_groups(invoice.get("lines"))
    supplied = invoice.get("tax_breakdown")
    missing = "tax_breakdown" not in invoice or supplied in (None, "")
    if missing or supplied == []:
        if len(expected) > 1:
            return [_finding(
                "INV-037",
                "Invoice mixes tax rates without a per-rate tax breakdown.",
                "Add tax_breakdown with one row per rate (tax_percent, taxable, tax), or use a single tax percentage.",
                "/tax_breakdown",
            )]
        return []
    if not isinstance(supplied, list):
        return [_finding(
            "INV-038",
            "Tax breakdown is not a list of per-rate rows.",
            "Provide tax_breakdown as an array of objects with tax_percent, taxable, and tax.",
            "/tax_breakdown",
        )]
    return _check_rows(supplied, expected)


def _line_groups(lines: Any) -> dict[Decimal, dict[str, Decimal]]:
    groups: dict[Decimal, dict[str, Decimal]] = {}
    if not isinstance(lines, list):
        return groups
    for line in lines:
        if not isinstance(line, dict):
            continue
        quantity, price, tax = _number(line.get("quantity")), _money(line.get("unit_price")), _number(line.get("tax_percent"))
        if quantity is None or quantity <= 0 or price is None or price < 0:
            continue
        if tax is None or tax < 0 or tax > 100:
            continue
        line_net = (quantity * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        line_tax = (line_net * tax / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        bucket = groups.setdefault(tax, {"taxable": Decimal("0.00"), "tax": Decimal("0.00")})
        bucket["taxable"] += line_net
        bucket["tax"] += line_tax
    return groups


def _check_rows(rows: list[Any], expected: dict[Decimal, dict[str, Decimal]]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    seen: dict[Decimal, int] = {}
    for index, row in enumerate(rows):
        path = f"/tax_breakdown/{index}"
        if not isinstance(row, dict):
            findings.append(_finding(
                "INV-038",
                f"Tax breakdown row {index + 1} is not an object.",
                "Provide tax_percent, taxable, and tax on each breakdown row.",
                path,
            ))
            continue
        percent = _number(row.get("tax_percent"))
        taxable = _money(row.get("taxable"))
        tax = _money(row.get("tax"))
        if percent is None or percent < 0 or percent > 100:
            findings.append(_finding(
                "INV-038",
                f"Tax breakdown row {index + 1} tax percentage is missing or invalid.",
                "Use the tax percentage supplied by your authoritative source; this tool does not choose it.",
                f"{path}/tax_percent",
            ))
            continue
        if percent in seen:
            findings.append(_finding(
                "INV-038",
                "Tax breakdown repeats the same tax percentage on more than one row.",
                "Keep one breakdown row per tax percentage.",
                f"{path}/tax_percent",
            ))
            continue
        seen[percent] = index
        if taxable is None or taxable < 0:
            findings.append(_finding(
                "INV-038",
                f"Tax breakdown row {index + 1} taxable amount is missing or invalid.",
                "Set taxable to the net of the lines at this rate.",
                f"{path}/taxable",
            ))
            continue
        if tax is None or tax < 0:
            findings.append(_finding(
                "INV-038",
                f"Tax breakdown row {index + 1} tax amount is missing or invalid.",
                "Set tax to taxable times the row percentage, rounded to cents.",
                f"{path}/tax",
            ))
            continue
        expected_tax = (taxable * percent / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if tax != expected_tax:
            findings.append(_finding(
                "INV-038",
                f"Tax breakdown row {index + 1} tax amount does not equal taxable times the percentage.",
                f"Set tax to {expected_tax} or correct taxable and tax_percent.",
                f"{path}/tax",
            ))
        group = expected.get(percent)
        if group is None:
            findings.append(_finding(
                "INV-038",
                f"Tax breakdown row {index + 1} names a tax percentage that no line uses.",
                "Remove the extra row, or correct the line tax percentages.",
                f"{path}/tax_percent",
            ))
            continue
        if taxable != group["taxable"]:
            findings.append(_finding(
                "INV-038",
                f"Tax breakdown row {index + 1} taxable amount does not match the lines at that rate.",
                f"Set taxable to {group['taxable']} or correct the line nets.",
                f"{path}/taxable",
            ))
    for percent in expected:
        if percent not in seen:
            findings.append(_finding(
                "INV-038",
                "Tax breakdown is missing a row for a tax percentage used on the lines.",
                "Add one breakdown row per line tax percentage.",
                "/tax_breakdown",
            ))
    return findings


def _money(value: Any) -> Decimal | None:
    result = _number(value)
    return result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if result is not None else None


def _number(value: Any) -> Decimal | None:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() else None


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
