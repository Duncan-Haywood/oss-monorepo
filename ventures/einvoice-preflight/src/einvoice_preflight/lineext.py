"""A PINT line's own VAT and amount with VAT (INV-060).

Mirror of lineext.mjs. PINT UAE (BTAE-08 line VAT, BTAE-10 line amount payable)
and PINT Oman (BTOM-016, BTOM-017) restate each line's VAT and amount with VAT in
cac:ItemPriceExtension. No UAE rule fixes their arithmetic; a line is flagged only
when one is more than 0.01 off net x rate (0 in reverse charge AE and the UAE's
margin scheme N, and on exempt lines) or net + line VAT. PINT Malaysia is left
out: LHDN's samples write that amount as a fact no reading of the line gives.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from .linenet import tax_percent_of
from .numbers import parse_decimal

_TOLERANCE = Decimal("0.01")


def _jurisdiction(invoice: dict[str, Any]) -> str | None:
    spec = str(invoice.get("specification_id") or "")
    if not re.search(r"urn:peppol:pint:", spec, re.I):
        return None
    if re.search(r"@ae-1", spec, re.I):
        return "ae"
    if re.search(r"@om-1", spec, re.I):
        return "om"
    return None


def _shown(value: Decimal) -> str:
    for places in (2, 3, 4):
        fixed = value.quantize(Decimal(1).scaleb(-places))
        if fixed == value:
            return f"{fixed:.{places}f}"
    return f"{value:.4f}"


def inspect_line_extension(invoice: Any) -> list[dict[str, str]]:
    if not isinstance(invoice, dict) or not isinstance(invoice.get("lines"), list):
        return []
    where = _jurisdiction(invoice)
    if where is None:
        return []
    vat_id, amount_id, label = ("BTAE-08", "BTAE-10", "amount payable") if where == "ae" else ("BTOM-016", "BTOM-017", "amount with VAT")

    def zero_tax(category: str) -> bool:
        return category == "AE" or (where == "ae" and category == "N")

    findings: list[dict[str, str]] = []
    for index, line in enumerate(invoice["lines"]):
        if not isinstance(line, dict):
            continue
        net = parse_decimal(line.get("net"))
        stated = parse_decimal(line.get("tax_amount"))
        amount = parse_decimal(line.get("amount_with_vat"))
        if net is None or (stated is None and amount is None):
            continue
        raw = line.get("tax_category")
        category = raw.strip().upper() if isinstance(raw, str) else ""
        percent = tax_percent_of(line)
        n = index + 1
        vat = stated
        if stated is not None and percent is not None:
            want = Decimal(0) if zero_tax(category) or category == "E" else net * percent / 100
            if abs(stated - want) > _TOLERANCE:
                if zero_tax(category):
                    why = f"0 in category {category}, whatever rate it states"
                elif category == "E":
                    why = "0 on an exempt line"
                else:
                    why = f"the line net {_shown(net)} times {percent}%, {_shown(want)}"
                findings.append({
                    "rule": "INV-060",
                    "message": f"Line {n} VAT ({vat_id}, ItemPriceExtension) is {_shown(stated)}; it should be {why}.",
                    "fix": f"Set the line VAT to {_shown(want)}, or correct the line net or rate; the repair pass does this.",
                    "path": f"/lines/{index}/tax_amount",
                })
                vat = want
        elif stated is None and category != "E":
            continue
        if amount is None:
            continue
        expected = net + (vat if vat is not None else Decimal(0))
        if abs(amount - expected) > _TOLERANCE:
            findings.append({
                "rule": "INV-060",
                "message": f"Line {n} {label} ({amount_id}, ItemPriceExtension) is {_shown(amount)}; the line net plus its VAT is {_shown(expected)}.",
                "fix": f"Set the line {label} to {_shown(expected)}; the repair pass does this.",
                "path": f"/lines/{index}/amount_with_vat",
            })
    return findings
