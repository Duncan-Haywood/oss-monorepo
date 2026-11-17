"""BT-111 in the invoice's own currency must equal BT-110 (INV-059).

Mirror of taxcurrency.mjs. When the VAT accounting currency is the invoice
currency (every SAR invoice under ZATCA), the second TaxTotal is the same tax
written twice. No official rule set this tool runs compares the two; a seeded
mismatch passed every rule in 17 of 17 seeds on 2026-11-12. A BT-111 in another
currency needs the seller's exchange rate and is not checked.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from .numbers import parse_decimal


def _cents(value: Any) -> Decimal | None:
    parsed = parse_decimal(value)
    return None if parsed is None else parsed.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def inspect_accounting_currency_tax(invoice: Any) -> list[dict[str, str]]:
    totals = invoice.get("totals") if isinstance(invoice, dict) else None
    if not isinstance(totals, dict) or totals.get("tax_accounting_currency") is None:
        return []
    repeat = _cents(totals.get("tax_accounting_currency"))
    tax = _cents(totals.get("tax"))
    if repeat is None or tax is None or repeat == tax:
        return []
    currency = invoice.get("currency") or "the invoice currency"
    return [{
        "rule": "INV-059",
        "message": (
            f"The VAT total in the VAT accounting currency (BT-111, {repeat}) differs from the "
            f"document VAT total (BT-110, {tax}) although both are in {currency}."
        ),
        "fix": f"Set the second VAT total to {tax}, or correct the VAT breakdown if that is the wrong figure; the repair pass does this.",
        "path": "/totals/tax_accounting_currency",
    }]
