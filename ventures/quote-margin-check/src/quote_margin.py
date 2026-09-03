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
    # Optional padding on the planned hours, for quoting work that has a
    # history of running long. Defaults to 0 so it changes nothing until it is
    # set, which is why it can be added here without moving any existing
    # number. The browser calculator has offered this since it shipped; the
    # CLI did not, so anyone scoring a folder of quotes from a script got a
    # strictly smaller answer than someone typing the same quote into the page.
    time_buffer_percent: float = 0


def load_quote(data: dict[str, Any]) -> Quote:
    currency = data.get("currency", "units")
    if not isinstance(currency, str) or not currency.strip() or len(currency.strip()) > 12:
        raise ValueError("currency must be a short non-empty label")
    fields = ("price", "delivery_hours", "admin_hours", "revision_hours", "overhead", "subcontractor_cost", "target_hourly_rate", "time_buffer_percent")
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
    buffered_hours = total_hours * (1 + quote.time_buffer_percent / 100)
    buffered_target_price = buffered_hours * quote.target_hourly_rate + direct_costs
    hidden_hours = quote.admin_hours + quote.revision_hours
    target_rate_hours = (quote.price - direct_costs) / quote.target_hourly_rate
    return {
        "total_hours": total_hours,
        "direct_costs": direct_costs,
        "effective_hourly_rate": effective_rate,
        "target_price": target_price,
        "break_even_price": direct_costs,
        "buffered_hours": buffered_hours,
        "buffered_target_price": buffered_target_price,
        "gap_to_target": quote.price - target_price,
        "cost_coverage": quote.price - direct_costs,
        "discount_room": max(0, quote.price - target_price),
        "minimum_price_adjustment": max(0.0, target_price - quote.price),
        "delivery_hours": quote.delivery_hours,
        "hidden_hours": hidden_hours,
        "hidden_time_percent": (hidden_hours / total_hours) * 100,
        "target_rate_hours": target_rate_hours,
        "hours_cushion": target_rate_hours - total_hours,
    }


def change_order_price(quote: Quote, extra_hours: float, extra_direct_costs: float = 0) -> dict[str, float]:
    """Calculate the target-rate price floor for additional scope."""
    for name, value in (("extra_hours", extra_hours), ("extra_direct_costs", extra_direct_costs)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be a non-negative number")
    return {
        "extra_hours": float(extra_hours),
        "extra_direct_costs": float(extra_direct_costs),
        "target_price": float(extra_hours) * quote.target_hourly_rate + float(extra_direct_costs),
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


def overrun_scenarios(
    quote: Quote,
    result: dict[str, float],
    percentages: tuple[int, ...] = (10, 25, 50),
) -> list[dict[str, float]]:
    """Same price and direct costs, more hours. Mirrors ``overrunScenarios``.

    The quoted price is fixed, so every hour the job runs long comes out of the
    effective rate. This is the arithmetic of a fixed quote running long, not a
    forecast that it will.
    """
    rows = []
    for percent in percentages:
        hours = result["total_hours"] * (1 + percent / 100)
        rows.append(
            {
                "percent": float(percent),
                "total_hours": hours,
                "effective_hourly_rate": (quote.price - result["direct_costs"]) / hours,
                "gap_to_target": quote.price - (hours * quote.target_hourly_rate + result["direct_costs"]),
            }
        )
    return rows


def direct_cost_spike_scenarios(
    quote: Quote,
    result: dict[str, float],
    percentages: tuple[int, ...] = (10, 25, 50),
) -> list[dict[str, float]]:
    """Same hours and price, higher overhead and subcontractor cost.

    Mirrors ``directCostSpikeScenarios``. Complements ``overrun_scenarios``,
    which moves time and holds costs fixed. The 0% row is the quote as entered
    so a row can be read without referring back to ``result``.
    """
    percents = (0, *(percent for percent in percentages if percent != 0))
    rows = []
    for percent in percents:
        direct_costs = result["direct_costs"] * (1 + percent / 100)
        target_price = result["total_hours"] * quote.target_hourly_rate + direct_costs
        gap_to_target = quote.price - target_price
        rows.append(
            {
                "percent": float(percent),
                "direct_costs": direct_costs,
                "effective_hourly_rate": (quote.price - direct_costs) / result["total_hours"],
                "target_price": target_price,
                "gap_to_target": gap_to_target,
                "extra_gap": gap_to_target - result["gap_to_target"],
                "cost_coverage": quote.price - direct_costs,
            }
        )
    return rows


def target_rate_ladder(
    quote: Quote,
    result: dict[str, float],
    rates: tuple[float, ...] = (50, 75, 100, 125),
) -> list[dict[str, float]]:
    """The quote each nearby hourly target would need, at the supplied hours.

    Mirrors ``targetRateLadder``. A comparison of negotiation anchors against
    the quote as entered — arithmetic only, not pricing advice.
    """
    rows = []
    for rate in rates:
        target_price = result["total_hours"] * rate + result["direct_costs"]
        rows.append(
            {
                "hourly_rate": float(rate),
                "target_price": target_price,
                "difference_from_quote": target_price - quote.price,
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


def sensitivity(quote: Quote, result: dict[str, float]) -> dict[str, list[dict[str, float | None]]]:
    """Every what-if table the browser draws, in one payload.

    The browser has long shown time overrun, direct-cost spikes, discount asks,
    the price ladder, and fixed-vs-hourly side by side, while the CLI reported
    only the base result. Someone checking a folder of quotes from a script was
    getting a strictly smaller answer than someone typing one quote into the
    page. Building all five here keeps the JSON, batch JSON, and Markdown
    reports from drifting apart again.
    """
    return {
        "overrun_scenarios": overrun_scenarios(quote, result),
        "direct_cost_spikes": direct_cost_spike_scenarios(quote, result),
        "discount_asks": discount_ask_scenarios(quote, result),
        "target_rate_ladder": target_rate_ladder(quote, result),
        "billing_models": compare_billing_models(quote, result),
    }


def survives_overrun_percent(quote: Quote, result: dict[str, float]) -> float | None:
    """Largest listed overrun the quote still meets the supplied target at.

    ``None`` when the quote misses the target at planned hours, because no
    amount of running long fixes that. This is the one figure a spreadsheet
    user sorting a folder of quotes actually filters on: which of these die
    first if the work runs long.
    """
    if result["gap_to_target"] < 0:
        return None
    survived = 0.0
    for row in overrun_scenarios(quote, result):
        if row["gap_to_target"] >= 0:
            survived = row["percent"]
        else:
            break
    return survived


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
        f"| Break-even price (direct costs only) | {quote.currency} {result['break_even_price']:.2f} |",
        f"| Effective hourly rate | {quote.currency} {result['effective_hourly_rate']:.2f}/hour |",
        f"| Price at supplied target rate | {quote.currency} {result['target_price']:.2f} |",
        f"| Gap to target price | {quote.currency} {result['gap_to_target']:.2f} |",
        # Only worth a row once the quote actually asks for a buffer. At the
        # default of 0 these two repeat the planned hours and target price
        # verbatim, and a table that restates itself teaches the reader to skip
        # rows. Matches how the browser page hides the same panel.
        *(
            [
                f"| Planned hours plus a {quote.time_buffer_percent:.0f}% buffer | {result['buffered_hours']:.2f} |",
                f"| Price at target rate for buffered hours | {quote.currency} {result['buffered_target_price']:.2f} |",
            ]
            if quote.time_buffer_percent
            else []
        ),
        # `target_rate_hours` is signed, and goes negative when direct costs
        # exceed the price. Printing "-4.00 (31.00 over)" reads as a quantity
        # of hours; what a negative there means is that there is no budget to
        # spend. Keeps the browser build's wording (site/index.html).
        "| Hours supported at target rate | "
        + (
            "none — direct costs leave nothing to pay for time"
            if result["cost_coverage"] <= 0
            else f"{result['target_rate_hours']:.2f} ({abs(result['hours_cushion']):.2f} {'remaining' if result['hours_cushion'] >= 0 else 'over'})"
        )
        + " |",
        f"| After direct costs | {quote.currency} {result['cost_coverage']:.2f} |",
        f"| Maximum discount before target | {quote.currency} {result['discount_room']:.2f} |",
        f"| Minimum increase to reach target | {quote.currency} {result['minimum_price_adjustment']:.2f} |",
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
            "## If the work runs long",
            "",
            "Quoted price and direct costs stay fixed; only hours move.",
            "",
            "| Extra time | Hours | Effective rate | Gap to target |",
            "|---|---:|---:|---:|",
        ]
    )
    for row in overrun_scenarios(quote, result):
        lines.append(
            f"| +{row['percent']:.0f}% | {row['total_hours']:.2f} | {quote.currency} {row['effective_hourly_rate']:.2f}/hour | {quote.currency} {row['gap_to_target']:.2f} |"
        )
    lines.extend(
        [
            "",
            "## If direct costs rise before work starts",
            "",
            "Hours and the quoted price stay fixed; only overhead and subcontractor cost move.",
            "",
            "| Cost rise | Direct costs | Effective rate | Gap to target |",
            "|---|---:|---:|---:|",
        ]
    )
    for row in direct_cost_spike_scenarios(quote, result):
        label = "as quoted" if row["percent"] == 0 else f"+{row['percent']:.0f}%"
        lines.append(
            f"| {label} | {quote.currency} {row['direct_costs']:.2f} | {quote.currency} {row['effective_hourly_rate']:.2f}/hour | {quote.currency} {row['gap_to_target']:.2f} |"
        )
    lines.extend(
        [
            "",
            "## If the client asks for a discount",
            "",
            "Hours and direct costs stay fixed; only the quoted price moves. Hours to cut is the scope that would have to leave for the supplied target to still hold — blank when the discounted price no longer covers direct costs, which cutting scope cannot fix.",
            "",
            "| Discount | Price | Effective rate | Gap to target | Hours to cut |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for row in discount_ask_scenarios(quote, result):
        label = "as quoted" if row["percent"] == 0 else f"-{row['percent']:.0f}%"
        hours_to_cut = "—" if row["hours_to_cut"] is None else f"{row['hours_to_cut']:.2f}"
        lines.append(
            f"| {label} | {quote.currency} {row['discounted_price']:.2f} | {quote.currency} {row['effective_hourly_rate']:.2f}/hour | {quote.currency} {row['gap_to_target']:.2f} | {hours_to_cut} |"
        )
    lines.extend(
        [
            "",
            "## The same job at other hourly targets",
            "",
            "| Hourly target | Price it implies | Difference from this quote |",
            "|---|---:|---:|",
        ]
    )
    for row in target_rate_ladder(quote, result):
        lines.append(
            f"| {quote.currency} {row['hourly_rate']:.2f}/hour | {quote.currency} {row['target_price']:.2f} | {quote.currency} {row['difference_from_quote']:.2f} |"
        )
    lines.extend(
        [
            "",
            "Every table above is an arithmetic what-if on the supplied inputs, not a forecast of delivery time, costs, or what a client will accept.",
            "",
            "This is a customer-supplied estimate, not tax, financial, or business advice. It does not certify profitability or account for every cost. Review the assumptions before using the result.",
        ]
    )
    return "\n".join(lines) + "\n"


def safe_text(value: str) -> str:
    """Neutralise a cell a spreadsheet would evaluate as a formula.

    Mirrors ``safeText`` in ``site/export.mjs``. Excel, LibreOffice, and
    Sheets treat a cell opening with = + - or @ as a formula, so a currency
    label or quote filename of ``=1+1`` becomes live arithmetic for whoever
    opens the file. A leading apostrophe is the standard inert prefix.

    Only for free-text cells: every numeric cell is formatted ``.2f`` and a
    negative gap legitimately starts with ``-``, which must stay a number.
    """
    text = str(value)
    return f"'{text}" if text[:1] in "=+-@\t\r" else text


def csv_report(quote: Quote, result: dict[str, float]) -> None:
    """Write one spreadsheet-friendly result row per measure."""
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(("measure", "value", "unit"))
    currency = safe_text(quote.currency)
    per_hour = safe_text(f"{quote.currency}/hour")
    writer.writerows(
        (
            ("quoted_price", f"{quote.price:.2f}", currency),
            ("total_working_hours", f"{result['total_hours']:.2f}", "hours"),
            ("direct_costs", f"{result['direct_costs']:.2f}", currency),
            ("break_even_price", f"{result['break_even_price']:.2f}", currency),
            ("effective_hourly_rate", f"{result['effective_hourly_rate']:.2f}", per_hour),
            ("target_price", f"{result['target_price']:.2f}", currency),
            # Unconditional here, unlike the Markdown table: a spreadsheet is
            # read by column position and by formulas pointing at a row, so a
            # row that appears only for some quotes breaks whoever batches the
            # CLI over a folder. Same three rows, same order, as quoteCsv() in
            # site/export.mjs.
            ("time_buffer_percent", f"{quote.time_buffer_percent:.2f}", "percent"),
            ("buffered_hours", f"{result['buffered_hours']:.2f}", "hours"),
            ("buffered_target_price", f"{result['buffered_target_price']:.2f}", currency),
            ("gap_to_target", f"{result['gap_to_target']:.2f}", currency),
            ("target_rate_hours", f"{result['target_rate_hours']:.2f}", "hours"),
            ("hours_cushion", f"{result['hours_cushion']:.2f}", "hours"),
            ("cost_coverage", f"{result['cost_coverage']:.2f}", currency),
            ("discount_room", f"{result['discount_room']:.2f}", currency),
            ("minimum_price_adjustment", f"{result['minimum_price_adjustment']:.2f}", currency),
            ("hourly_bill_at_planned_hours", f"{result['target_price']:.2f}", currency),
            ("hourly_minus_fixed_at_planned_hours", f"{result['target_price'] - quote.price:.2f}", currency),
        )
    )
    # The sensitivity rows a spreadsheet user would otherwise have to rebuild
    # by hand, one column per what-if, using the same measure/value/unit shape.
    for row in overrun_scenarios(quote, result):
        percent = f"{row['percent']:.0f}"
        writer.writerow((f"effective_hourly_rate_at_plus_{percent}_percent_hours", f"{row['effective_hourly_rate']:.2f}", per_hour))
        writer.writerow((f"gap_to_target_at_plus_{percent}_percent_hours", f"{row['gap_to_target']:.2f}", currency))
    for row in direct_cost_spike_scenarios(quote, result):
        if row["percent"] == 0:
            continue
        writer.writerow((f"gap_to_target_at_plus_{row['percent']:.0f}_percent_direct_costs", f"{row['gap_to_target']:.2f}", currency))
    survives = survives_overrun_percent(quote, result)
    writer.writerow(("survives_overrun_percent", "" if survives is None else f"{survives:.0f}", "percent"))


def batch_csv_report(reports: list[tuple[str, Quote, dict[str, float]]]) -> None:
    """Write a comparison table for several quote files."""
    writer = csv.writer(sys.stdout, lineterminator="\n")
    # `survives_overrun_percent` is the column that makes a folder of quotes
    # sortable by the question the batch exists to answer: which of these stop
    # meeting the target first if the work runs long. Blank means the quote
    # already misses the target at planned hours.
    writer.writerow(("quote", "currency", "quoted_price", "total_hours", "direct_costs", "break_even_price", "effective_hourly_rate", "target_price", "gap_to_target", "gap_to_target_at_plus_25_percent_hours", "survives_overrun_percent"))
    for name, quote, result in reports:
        # `name` is a filename from the scanned directory and `currency` is
        # typed into the quote file: both are free text reaching a spreadsheet.
        overrun_25 = next(row for row in overrun_scenarios(quote, result) if row["percent"] == 25)
        survives = survives_overrun_percent(quote, result)
        writer.writerow((safe_text(name), safe_text(quote.currency), f"{quote.price:.2f}", f"{result['total_hours']:.2f}", f"{result['direct_costs']:.2f}", f"{result['break_even_price']:.2f}", f"{result['effective_hourly_rate']:.2f}", f"{result['target_price']:.2f}", f"{result['gap_to_target']:.2f}", f"{overrun_25['gap_to_target']:.2f}", "" if survives is None else f"{survives:.0f}"))


def load_reports(directory: Path) -> list[tuple[str, Quote, dict[str, float]]]:
    reports = []
    for path in sorted(directory.glob("*.json")):
        quote = load_quote(json.loads(path.read_text(encoding="utf-8")))
        reports.append((path.name, quote, calculate(quote)))
    if not reports:
        raise ValueError("directory must contain at least one .json quote file")
    return reports


def main(argv: list[str] | None = None) -> int:
    """Run the CLI. ``argv`` defaults to ``sys.argv[1:]`` so callers — tests
    included — can invoke it without reassigning ``sys.argv``."""
    parser = argparse.ArgumentParser(
        description="Check a quote against a supplied hourly-rate target",
        epilog="No warranty. Arithmetic only, not tax, financial, or business advice. Review and verify every assumption before relying on this output.",
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("--batch", action="store_true", help="read every .json quote in the input directory")
    parser.add_argument("--format", choices=("json", "markdown", "csv"), default="markdown")
    parser.add_argument("--usage-log", type=Path)
    args = parser.parse_args(argv)
    if args.batch:
        reports = load_reports(args.input)
        if args.format == "csv":
            batch_csv_report(reports)
        elif args.format == "json":
            print(json.dumps({"reports": [{"file": name, "inputs": quote.__dict__, "result": result, "survives_overrun_percent": survives_overrun_percent(quote, result), **sensitivity(quote, result)} for name, quote, result in reports], "disclaimer": "Arithmetic only; not tax, financial, or business advice. Every scenario is a what-if on the supplied inputs, not a forecast."}, indent=2))
        else:
            for index, (name, quote, result) in enumerate(reports):
                if index:
                    print()
                print(f"## {name}\n\n{markdown(quote, result)}", end="")
    else:
        quote = load_quote(json.loads(args.input.read_text(encoding="utf-8")))
        result = calculate(quote)
        if args.format == "json":
            print(json.dumps({"inputs": quote.__dict__, "result": result, "survives_overrun_percent": survives_overrun_percent(quote, result), **sensitivity(quote, result), "disclaimer": "Arithmetic only; not tax, financial, or business advice. Every scenario is a what-if on the supplied inputs, not a forecast."}, indent=2))
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
