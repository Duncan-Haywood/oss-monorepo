#!/usr/bin/env python3
"""Calculate transparent quote economics from customer-supplied inputs."""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Quote:
    price: float
    delivery_hours: float
    admin_hours: float = 0
    revision_hours: float = 0
    overhead: float = 0
    subcontractor_cost: float = 0
    target_hourly_rate: float = 0


def load_quote(data: dict[str, Any]) -> Quote:
    fields = ("price", "delivery_hours", "admin_hours", "revision_hours", "overhead", "subcontractor_cost", "target_hourly_rate")
    values: dict[str, float] = {}
    for field in fields:
        value = data.get(field, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
            raise ValueError(f"{field} must be a non-negative number")
        values[field] = float(value)
    if values["price"] <= 0:
        raise ValueError("price must be greater than zero")
    if values["delivery_hours"] <= 0:
        raise ValueError("delivery_hours must be greater than zero")
    if values["target_hourly_rate"] <= 0:
        raise ValueError("target_hourly_rate must be greater than zero")
    return Quote(**values)


def calculate(quote: Quote) -> dict[str, float]:
    total_hours = quote.delivery_hours + quote.admin_hours + quote.revision_hours
    direct_costs = quote.overhead + quote.subcontractor_cost
    effective_rate = (quote.price - direct_costs) / total_hours
    target_price = total_hours * quote.target_hourly_rate + direct_costs
    return {
        "total_hours": total_hours,
        "direct_costs": direct_costs,
        "effective_hourly_rate": effective_rate,
        "target_price": target_price,
        "gap_to_target": quote.price - target_price,
    }


def markdown(quote: Quote, result: dict[str, float]) -> str:
    status = "above target" if result["gap_to_target"] >= 0 else "below target"
    lines = [
        "# Quote Margin Check",
        "",
        f"Status: **{status}** (arithmetic comparison only)",
        "",
        "| Measure | Result |",
        "|---|---:|",
        f"| Quoted price | {quote.price:.2f} |",
        f"| Total working hours | {result['total_hours']:.2f} |",
        f"| Direct costs | {result['direct_costs']:.2f} |",
        f"| Effective hourly rate | {result['effective_hourly_rate']:.2f} |",
        f"| Price at supplied target rate | {result['target_price']:.2f} |",
        f"| Gap to target price | {result['gap_to_target']:.2f} |",
        "",
        "This is a customer-supplied estimate, not tax, financial, or business advice. It does not certify profitability or account for every cost. Review the assumptions before using the result.",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check a quote against a supplied hourly-rate target")
    parser.add_argument("input", type=Path)
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--usage-log", type=Path)
    args = parser.parse_args()
    quote = load_quote(json.loads(args.input.read_text(encoding="utf-8")))
    result = calculate(quote)
    if args.format == "json":
        print(json.dumps({"inputs": quote.__dict__, "result": result, "disclaimer": "Arithmetic only; not tax, financial, or business advice."}, indent=2))
    else:
        print(markdown(quote, result), end="")
    if args.usage_log:
        event = {"event": "report_generated", "at": datetime.now(timezone.utc).isoformat()}
        with args.usage_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
