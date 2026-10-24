"""Line and per-rate tax arithmetic shared by checks.py and breakdown.py.

Follows EN 16931: line net = quantity x (price / price base quantity) + line
charges - line allowances, rounded to cents; VAT is worked out per rate on the
summed taxable amount, not per line. Mirrors linenet.mjs.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

_CENT = Decimal("0.01")


def _number(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        result = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None
    return result if result.is_finite() else None


def round_cents(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def _signed_adjustment(rows: Any) -> Decimal:
    delta = Decimal("0")
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind", "")).lower()
        amount = _number(row.get("amount"))
        if amount is None or amount < 0 or kind not in ("charge", "allowance"):
            continue
        delta += amount if kind == "charge" else -amount
    return delta


def expected_line_net(line: dict[str, Any], apply_base: bool = True) -> Decimal | None:
    quantity, price = _number(line.get("quantity")), _number(line.get("unit_price"))
    if quantity is None or price is None:
        return None
    base = _number(line.get("price_base_quantity")) if apply_base else None
    if base is None or base <= 0:
        base = Decimal("1")
    return round_cents(quantity * price / base + _signed_adjustment(line.get("adjustments")))


def accepted_line_net(line: dict[str, Any], supplied: Decimal | None) -> Decimal | None:
    """The base quantity is applied, but a supplied net that matches the
    unscaled reading is accepted (the official CII example 8 states one)."""
    primary = expected_line_net(line)
    if primary is None or supplied is None:
        return primary
    unscaled = expected_line_net(line, False)
    return unscaled if supplied == unscaled else primary


def summed_line_net(line: dict[str, Any], invoice: dict[str, Any]) -> Decimal | None:
    """Parsed UBL/CII files sum the stated line nets (BR-CO-10), so a wrong one
    is reported once as INV-012; draft JSON sums quantity times price."""
    stated = _number(line.get("net"))
    parsed = isinstance(invoice.get("source_format"), str)
    return expected_line_net(line) if stated is None or not parsed else round_cents(stated)


def tax_percent_of(item: dict[str, Any]) -> Decimal | None:
    percent = _number(item.get("tax_percent"))
    if percent is not None:
        return percent
    category = item.get("tax_category")
    if isinstance(category, str) and category.strip().upper() == "O":
        return Decimal("0")
    return None


def tax_key_mode(invoice: dict[str, Any]) -> bool:
    lines = invoice.get("lines") if isinstance(invoice.get("lines"), list) else []
    rows = invoice.get("tax_breakdown") if isinstance(invoice.get("tax_breakdown"), list) else []

    def named(item: Any) -> bool:
        return isinstance(item, dict) and isinstance(item.get("tax_category"), str) and bool(item["tax_category"].strip())

    return bool(lines) and all(named(i) for i in lines) and all(named(i) for i in rows)


def tax_key(item: dict[str, Any], with_category: bool) -> Any:
    percent = tax_percent_of(item)
    if percent is None:
        return None
    if not with_category:
        return percent
    category = item.get("tax_category")
    category = category.strip().upper() if isinstance(category, str) else ""
    return (category, percent) if category else None


def tax_groups(invoice: dict[str, Any]) -> tuple[dict[Any, dict[str, Decimal]], bool, bool]:
    """(groups, unattributed, with_category). A header row naming no VAT
    percentage can only be placed when there is a single rate."""
    with_category = tax_key_mode(invoice)
    groups: dict[Any, dict[str, Decimal]] = {}
    unattributed = False

    def add(key: Any, percent: Decimal, amount: Decimal) -> None:
        group = groups.setdefault(key, {"taxable": Decimal("0"), "tax": Decimal("0"), "percent": percent})
        group["taxable"] += amount

    lines = invoice.get("lines") if isinstance(invoice.get("lines"), list) else []
    for line in lines:
        if not isinstance(line, dict):
            continue
        net, percent = summed_line_net(line, invoice), tax_percent_of(line)
        if net is None or percent is None or percent < 0 or percent > 100:
            continue
        add(tax_key(line, with_category), percent, net)
    adjustments = invoice.get("adjustments") if isinstance(invoice.get("adjustments"), list) else []
    for row in adjustments:
        delta = _signed_adjustment([row])
        if not delta:
            continue
        key = tax_key(row, with_category) if isinstance(row, dict) else None
        if key is not None:
            add(key, groups[key]["percent"] if key in groups else tax_percent_of(row), delta)
        elif len(groups) == 1:
            only = next(iter(groups))
            add(only, groups[only]["percent"], delta)
        else:
            unattributed = True
    for group in groups.values():
        group["taxable"] = round_cents(group["taxable"])
        group["tax"] = round_cents(group["taxable"] * group["percent"] / Decimal("100"))
    return groups, unattributed, with_category
