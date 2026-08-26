#!/usr/bin/env python3
"""Calculate transparent quote economics from customer-supplied inputs."""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Quote:
    currency: str
    price: float
    delivery_hours: float
    admin_hours: float = 0
    revision_hours: float = 0
    overhead: float = 0
    subcontractor_cost: float = 0
    target_hourly_rate: float = 0


def load_quote(data: dict[str, Any]) -> Quote:
    currency = data.get("currency", "units")
    if not isinstance(currency, str) or not currency.strip() or len(currency.strip()) > 12:
        raise ValueError("currency must be a short non-empty label")
    fields = ("price", "delivery_hours", "admin_hours", "revision_hours", "overhead", "subcontractor_cost", "target_hourly_rate")
    values: dict[str, float] = {}
    for field in fields:
        value = data.get(field, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{field} must be a non-negative number")
        values[field] = float(value)
    if values["price"] <= 0:
        raise ValueError("price must be greater than zero")
    if values["delivery_hours"] <= 0:
        raise ValueError("delivery_hours must be greater than zero")
    if values["target_hourly_rate"] <= 0:
        raise ValueError("target_hourly_rate must be greater than zero")
    return Quote(currency=currency.strip(), **values)


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
        "cost_coverage": quote.price - direct_costs,
    }


def discount_ask_scenarios(
    quote: Quote,
    result: dict[str, float],
    percentages: tuple[int, ...] = (5, 10, 15, 20),
) -> list[dict[str, float | None]]:
    """Same hours and direct costs, lower quoted price. Complements time-overrun tables."""
    percents = (0, *(percent for percent in percentages if percent != 0))
    rows: list[dict[str, float | None]] = []
    for percent in percents:
        discounted_price = quote.price * (1 - percent / 100)
        cost_coverage = discounted_price - result["direct_costs"]
        if cost_coverage > 0:
            hours_at_target = cost_coverage / quote.target_hourly_rate
            hours_to_cut = max(0.0, result["total_hours"] - hours_at_target)
        else:
            hours_at_target = None
            hours_to_cut = None
        gap = discounted_price - result["target_price"]
        rows.append(
            {
                "percent": percent,
                "discounted_price": discounted_price,
                "cost_coverage": cost_coverage,
                "effective_hourly_rate": cost_coverage / result["total_hours"],
                "gap_to_target": gap,
                "extra_gap": gap - result["gap_to_target"],
                "hours_at_target": hours_at_target,
                "hours_to_cut": hours_to_cut,
            }
        )
    return rows


def compare_billing_models(
    quote: Quote,
    result: dict[str, float],
    percentages: tuple[float, ...] = (0, 10, 25, 50),
) -> list[dict[str, float]]:
    """Fixed quote vs hourly at the same hours and direct costs.

    Fixed keeps ``quote.price``. Hourly bills the hours at the supplied
    target rate plus the same direct costs. Planned hours (0%) answers
    whether the fixed quote is already a discount vs hourly.
    """
    rows = []
    for percent in percentages:
        hours = result["total_hours"] * (1 + percent / 100)
        hourly_total = hours * quote.target_hourly_rate + result["direct_costs"]
        rows.append(
            {
                "percent": float(percent),
                "total_hours": hours,
                "fixed_effective_rate": (quote.price - result["direct_costs"]) / hours,
                "hourly_total": hourly_total,
                "hourly_minus_fixed": hourly_total - quote.price,
            }
        )
    return rows


def billing_model_summary(quote: Quote, result: dict[str, float]) -> dict[str, float | bool]:
    planned = compare_billing_models(quote, result, (0,))[0]
    return {**planned, "fixed_is_below_hourly": planned["hourly_minus_fixed"] > 0}


def billing_model_note(quote: Quote, result: dict[str, float]) -> str:
    planned = billing_model_summary(quote, result)
    hourly = f"{quote.currency} {planned['hourly_total']:.2f}"
    if abs(planned["hourly_minus_fixed"]) < 1e-9:
        return (
            f"At planned hours, hourly at the supplied target would bill the same as this "
            f"fixed quote ({hourly}). Comparison only, not a recommendation of which to send."
        )
    gap = f"{quote.currency} {abs(planned['hourly_minus_fixed']):.2f}"
    direction = "more than" if planned["hourly_minus_fixed"] > 0 else "less than"
    return (
        f"At planned hours, hourly at the supplied target would bill {hourly} — "
        f"{gap} {direction} this fixed quote. Comparison only, not a recommendation of which to send."
    )


def markdown(quote: Quote, result: dict[str, float]) -> str:
    status = "above target" if result["gap_to_target"] >= 0 else "below target"
    billing = compare_billing_models(quote, result)
    lines = [
        "# Quote Margin Check",
        "",
        f"Status: **{status}** (arithmetic comparison only)",
        "",
        "| Measure | Result |",
        "|---|---:|",
        f"| Quoted price | {quote.currency} {quote.price:.2f} |",
        f"| Total working hours | {result['total_hours']:.2f} |",
        f"| Direct costs | {quote.currency} {result['direct_costs']:.2f} |",
        f"| Effective hourly rate | {quote.currency} {result['effective_hourly_rate']:.2f}/hour |",
        f"| Price at supplied target rate | {quote.currency} {result['target_price']:.2f} |",
        f"| Gap to target price | {quote.currency} {result['gap_to_target']:.2f} |",
        f"| After direct costs | {quote.currency} {result['cost_coverage']:.2f} |",
        "",
        "## Fixed quote vs hourly at your target",
        "",
        billing_model_note(quote, result),
        "",
        "| Extra time | Hours | Fixed effective rate | Hourly bill | Hourly minus fixed |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in billing:
        extra = "planned" if row["percent"] == 0 else f"+{row['percent']:.0f}%"
        lines.append(
            f"| {extra} | {row['total_hours']:.2f} | {quote.currency} {row['fixed_effective_rate']:.2f}/hour | {quote.currency} {row['hourly_total']:.2f} | {quote.currency} {row['hourly_minus_fixed']:.2f} |"
        )
    lines.extend(
        [
            "",
            "This is a customer-supplied estimate, not tax, financial, or business advice. It does not certify profitability or account for every cost. Review the assumptions before using the result.",
        ]
    )
    return "\n".join(lines) + "\n"


def csv_report(quote: Quote, result: dict[str, float]) -> None:
    """Write one spreadsheet-friendly result row per measure."""
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(("measure", "value", "unit"))
    writer.writerows(
        (
            ("quoted_price", f"{quote.price:.2f}", quote.currency),
            ("total_working_hours", f"{result['total_hours']:.2f}", "hours"),
            ("direct_costs", f"{result['direct_costs']:.2f}", quote.currency),
            ("effective_hourly_rate", f"{result['effective_hourly_rate']:.2f}", f"{quote.currency}/hour"),
            ("target_price", f"{result['target_price']:.2f}", quote.currency),
            ("gap_to_target", f"{result['gap_to_target']:.2f}", quote.currency),
            ("cost_coverage", f"{result['cost_coverage']:.2f}", quote.currency),
            ("hourly_bill_at_planned_hours", f"{result['target_price']:.2f}", quote.currency),
            ("hourly_minus_fixed_at_planned_hours", f"{result['target_price'] - quote.price:.2f}", quote.currency),
        )
    )


def batch_csv_report(reports: list[tuple[str, Quote, dict[str, float]]]) -> None:
    """Write a comparison table for several quote files."""
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(("quote", "currency", "quoted_price", "total_hours", "direct_costs", "effective_hourly_rate", "target_price", "gap_to_target"))
    for name, quote, result in reports:
        writer.writerow((name, quote.currency, f"{quote.price:.2f}", f"{result['total_hours']:.2f}", f"{result['direct_costs']:.2f}", f"{result['effective_hourly_rate']:.2f}", f"{result['target_price']:.2f}", f"{result['gap_to_target']:.2f}"))


def load_reports(directory: Path) -> list[tuple[str, Quote, dict[str, float]]]:
    reports = []
    for path in sorted(directory.glob("*.json")):
        quote = load_quote(json.loads(path.read_text(encoding="utf-8")))
        reports.append((path.name, quote, calculate(quote)))
    if not reports:
        raise ValueError("directory must contain at least one .json quote file")
    return reports


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check a quote against a supplied hourly-rate target",
        epilog="No warranty. Arithmetic only, not tax, financial, or business advice. Review and verify every assumption before relying on this output.",
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("--batch", action="store_true", help="read every .json quote in the input directory")
    parser.add_argument("--format", choices=("json", "markdown", "csv"), default="markdown")
    parser.add_argument("--usage-log", type=Path)
    args = parser.parse_args()
    if args.batch:
        reports = load_reports(args.input)
        if args.format == "csv":
            batch_csv_report(reports)
        elif args.format == "json":
            print(json.dumps({"reports": [{"file": name, "inputs": quote.__dict__, "result": result} for name, quote, result in reports], "disclaimer": "Arithmetic only; not tax, financial, or business advice."}, indent=2))
        else:
            for index, (name, quote, result) in enumerate(reports):
                if index:
                    print()
                print(f"## {name}\n\n{markdown(quote, result)}", end="")
    else:
        quote = load_quote(json.loads(args.input.read_text(encoding="utf-8")))
        result = calculate(quote)
        if args.format == "json":
            print(json.dumps({"inputs": quote.__dict__, "result": result, "disclaimer": "Arithmetic only; not tax, financial, or business advice."}, indent=2))
        elif args.format == "csv":
            csv_report(quote, result)
        else:
            print(markdown(quote, result), end="")
    if args.usage_log:
        event = {
            "event": "batch_report_generated" if args.batch else "report_generated",
            "format": args.format,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        with args.usage_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
