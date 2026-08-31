import contextlib
import io
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"

from src.quote_margin import batch_csv_report, billing_model_note, billing_model_summary, calculate, change_order_price, compare_billing_models, csv_report, direct_cost_spike_scenarios, discount_ask_scenarios, load_quote, load_reports, main, markdown, overrun_scenarios, sensitivity, survives_overrun_percent, target_rate_ladder


class QuoteMarginTests(unittest.TestCase):
    def test_calculates_hidden_time_and_target_price(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "admin_hours": 5, "revision_hours": 6, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        result = calculate(quote)
        self.assertEqual(result["total_hours"], 35)
        self.assertAlmostEqual(result["effective_hourly_rate"], 54.8571428, places=6)
        self.assertEqual(result["target_price"], 3105)
        self.assertEqual(result["break_even_price"], 480)
        self.assertEqual(result["gap_to_target"], -705)
        self.assertEqual(result["minimum_price_adjustment"], 705)
        self.assertEqual(result["hidden_hours"], 11)
        self.assertEqual(result["hidden_time_percent"], (11 / 35) * 100)
        self.assertEqual(result["target_rate_hours"], 25.6)
        self.assertAlmostEqual(result["hours_cushion"], -9.4)

    def test_reports_negative_target_rate_hours_when_costs_exceed_price(self) -> None:
        quote = load_quote({"price": 100, "delivery_hours": 1, "overhead": 150, "target_hourly_rate": 50})
        result = calculate(quote)
        self.assertEqual(result["target_rate_hours"], -1)
        self.assertEqual(result["hours_cushion"], -2)

    def test_markdown_says_no_hours_budget_instead_of_a_negative_hour_count(self) -> None:
        """target_rate_hours is signed and goes negative once direct costs pass
        the price. The row used to print it straight -- "-1.00 (-2.00 over)" --
        which reads as a quantity of hours. A negative there means there is no
        budget to spend. Mirrors the wording in site/index.html."""
        quote = load_quote({"price": 100, "delivery_hours": 1, "overhead": 150, "target_hourly_rate": 50})
        row = next(line for line in markdown(quote, calculate(quote)).splitlines() if "Hours supported" in line)
        self.assertIn("none — direct costs leave nothing to pay for time", row)
        self.assertNotIn("-1.00", row)

    def test_markdown_reports_the_overrun_without_a_sign(self) -> None:
        """"-9.40 over" said the same thing twice and disagreed with the
        browser build, which has always used the absolute value."""
        quote = load_quote({"price": 2400, "delivery_hours": 24, "admin_hours": 5, "revision_hours": 6, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        row = next(line for line in markdown(quote, calculate(quote)).splitlines() if "Hours supported" in line)
        self.assertIn("25.60 (9.40 over)", row)

    def test_defaults_optional_costs_and_time(self) -> None:
        quote = load_quote({"price": 1000, "delivery_hours": 10, "target_hourly_rate": 100})
        self.assertEqual(calculate(quote)["effective_hourly_rate"], 100)

    def test_rejects_invalid_required_values(self) -> None:
        invalid = [{"price": 0, "delivery_hours": 1, "target_hourly_rate": 1}, {"price": 1, "delivery_hours": -1, "target_hourly_rate": 1}, {"price": 1, "delivery_hours": 1, "target_hourly_rate": 0}]
        for data in invalid:
            with self.assertRaises(ValueError):
                load_quote(data)

    def test_rejects_boolean_as_number(self) -> None:
        with self.assertRaises(ValueError):
            load_quote({"price": True, "delivery_hours": 1, "target_hourly_rate": 1})

    def test_rejects_non_finite_numbers(self) -> None:
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.assertRaises(ValueError):
                load_quote({"price": value, "delivery_hours": 1, "target_hourly_rate": 1})

    def test_reports_price_left_after_direct_costs(self) -> None:
        quote = load_quote({"price": 1000, "delivery_hours": 10, "overhead": 125, "subcontractor_cost": 75, "target_hourly_rate": 80})
        self.assertEqual(calculate(quote)["cost_coverage"], 800)
        self.assertEqual(calculate(quote)["break_even_price"], 200)
        self.assertEqual(calculate(quote)["discount_room"], 0)
        self.assertEqual(calculate(quote)["minimum_price_adjustment"], 0)

    def test_reports_discount_room_above_target(self) -> None:
        quote = load_quote({"price": 4000, "delivery_hours": 10, "target_hourly_rate": 100})
        self.assertEqual(calculate(quote)["discount_room"], 3000)
        self.assertEqual(calculate(quote)["minimum_price_adjustment"], 0)

    def test_discount_ask_keeps_hours_and_direct_costs_fixed(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "admin_hours": 5, "revision_hours": 6, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        result = calculate(quote)
        rows = discount_ask_scenarios(quote, result)
        self.assertEqual([row["percent"] for row in rows], [0, 5, 10, 15, 20])
        ten = next(row for row in rows if row["percent"] == 10)
        self.assertEqual(ten["discounted_price"], 2160)
        self.assertEqual(ten["effective_hourly_rate"], 48)
        self.assertAlmostEqual(ten["hours_to_cut"], 12.6, places=9)
        self.assertEqual(result["total_hours"], 35)
        self.assertEqual(result["direct_costs"], 480)

    def test_csv_report_is_ready_for_spreadsheet_import(self) -> None:
        quote = load_quote({"currency": "EUR", "price": 2400, "delivery_hours": 24, "target_hourly_rate": 75})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            csv_report(quote, calculate(quote))
        self.assertEqual(
            output.getvalue().splitlines(),
            [
                "measure,value,unit",
                "quoted_price,2400.00,EUR",
                "total_working_hours,24.00,hours",
                "direct_costs,0.00,EUR",
                "break_even_price,0.00,EUR",
                "effective_hourly_rate,100.00,EUR/hour",
                "target_price,1800.00,EUR",
                "gap_to_target,600.00,EUR",
                "target_rate_hours,32.00,hours",
                "hours_cushion,8.00,hours",
                "cost_coverage,2400.00,EUR",
                "discount_room,600.00,EUR",
                "minimum_price_adjustment,0.00,EUR",
                "hourly_bill_at_planned_hours,1800.00,EUR",
                "hourly_minus_fixed_at_planned_hours,-600.00,EUR",
                # 24h at EUR 75 = 1800 against a 2400 quote, so this one still
                # clears the target at +25% hours (30h -> 2250) but not at +50%
                # (36h -> 2700). survives_overrun_percent is the summary of that.
                "effective_hourly_rate_at_plus_10_percent_hours,90.91,EUR/hour",
                "gap_to_target_at_plus_10_percent_hours,420.00,EUR",
                "effective_hourly_rate_at_plus_25_percent_hours,80.00,EUR/hour",
                "gap_to_target_at_plus_25_percent_hours,150.00,EUR",
                "effective_hourly_rate_at_plus_50_percent_hours,66.67,EUR/hour",
                "gap_to_target_at_plus_50_percent_hours,-300.00,EUR",
                "gap_to_target_at_plus_10_percent_direct_costs,600.00,EUR",
                "gap_to_target_at_plus_25_percent_direct_costs,600.00,EUR",
                "gap_to_target_at_plus_50_percent_direct_costs,600.00,EUR",
                "survives_overrun_percent,25,percent",
            ],
        )

    def test_csv_report_neutralises_a_formula_in_the_currency_label(self) -> None:
        # Mirrors "neutralises a formula typed into the currency label" in
        # site/export.test.mjs: the two implementations must agree.
        quote = load_quote({"currency": "=1+1", "price": 2400, "delivery_hours": 24, "target_hourly_rate": 75})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            csv_report(quote, calculate(quote))
        lines = output.getvalue().splitlines()
        self.assertEqual(lines[1], "quoted_price,2400.00,'=1+1")
        self.assertIn("effective_hourly_rate,100.00,'=1+1/hour", lines)
        for line in lines[1:]:
            unit = line.rsplit(",", 1)[-1]
            self.assertFalse(unit.startswith("="), f"unit cell {unit!r} would evaluate as a formula")

    def test_csv_report_keeps_a_negative_value_numeric(self) -> None:
        # The guard must not reach the value column: -600.00 is a number the
        # recipient sums, and an apostrophe would make it text.
        quote = load_quote({"currency": "EUR", "price": 2400, "delivery_hours": 24, "target_hourly_rate": 75})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            csv_report(quote, calculate(quote))
        self.assertIn("hourly_minus_fixed_at_planned_hours,-600.00,EUR", output.getvalue().splitlines())

    def test_currency_defaults_and_is_trimmed(self) -> None:
        quote = load_quote({"currency": " USD ", "price": 1000, "delivery_hours": 10, "target_hourly_rate": 100})
        self.assertEqual(quote.currency, "USD")

    def test_usage_event_records_format_without_quote_contents(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            usage_path = Path(directory) / "usage.jsonl"
            input_path = Path(directory) / "quote.json"
            input_path.write_text(json.dumps({"price": 1000, "delivery_hours": 10, "target_hourly_rate": 100}), encoding="utf-8")
            import sys
            original_argv = sys.argv
            try:
                sys.argv = ["quote_margin.py", str(input_path), "--format", "csv", "--usage-log", str(usage_path)]
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(main(), 0)
            finally:
                sys.argv = original_argv
            event = json.loads(usage_path.read_text(encoding="utf-8"))
            self.assertEqual(event["event"], "report_generated")
            self.assertEqual(event["format"], "csv")
            self.assertNotIn("price", event)

    def test_batch_reports_are_sorted_and_spreadsheet_ready(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "b.json").write_text(json.dumps({"price": 1000, "delivery_hours": 10, "target_hourly_rate": 100}), encoding="utf-8")
            (folder / "a.json").write_text(json.dumps({"price": 900, "delivery_hours": 10, "target_hourly_rate": 100}), encoding="utf-8")
            reports = load_reports(folder)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                batch_csv_report(reports)
            self.assertEqual(output.getvalue().splitlines()[1].split(",")[0], "a.json")
            self.assertEqual(len(output.getvalue().splitlines()), 3)

    def test_compares_fixed_quote_to_hourly_at_the_same_hours(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "admin_hours": 5, "revision_hours": 6, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        result = calculate(quote)
        rows = compare_billing_models(quote, result)
        self.assertEqual([row["percent"] for row in rows], [0, 10, 25, 50])
        self.assertEqual(rows[0]["hourly_total"], 3105)
        self.assertEqual(rows[0]["hourly_minus_fixed"], 705)
        self.assertEqual(rows[3]["hourly_total"], 4417.5)
        self.assertTrue(billing_model_summary(quote, result)["fixed_is_below_hourly"])
        note = billing_model_note(quote, result)
        self.assertIn("3105.00", note)
        self.assertIn("more than", note)
        self.assertIn("not a recommendation", note)

    def test_prices_extra_scope_at_the_quote_target_rate(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "target_hourly_rate": 75})
        self.assertEqual(
            change_order_price(quote, 4, 60),
            {"extra_hours": 4.0, "extra_direct_costs": 60.0, "target_price": 360.0},
        )

    def test_rejects_invalid_change_order_inputs(self) -> None:
        quote = load_quote({"price": 1000, "delivery_hours": 10, "target_hourly_rate": 100})
        with self.assertRaises(ValueError):
            change_order_price(quote, -1)
        with self.assertRaises(ValueError):
            change_order_price(quote, 1, float("inf"))

    # The four tables below already existed in site/calc.mjs. These assertions
    # pin the Python port to the same arithmetic, so the two surfaces cannot
    # answer the same quote differently.
    def test_overrun_scenarios_hold_price_and_costs_while_hours_grow(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        rows = overrun_scenarios(quote, calculate(quote))
        self.assertEqual([row["percent"] for row in rows], [10.0, 25.0, 50.0])
        self.assertAlmostEqual(rows[1]["total_hours"], 30)
        self.assertAlmostEqual(rows[1]["effective_hourly_rate"], (2400 - 480) / 30)
        self.assertAlmostEqual(rows[1]["gap_to_target"], 2400 - (30 * 75 + 480))

    def test_direct_cost_spikes_hold_hours_and_price_while_costs_grow(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        result = calculate(quote)
        rows = direct_cost_spike_scenarios(quote, result)
        # The 0% row is the quote as entered, so a reader never has to refer
        # back to `result` to interpret the rest of the table.
        self.assertEqual(rows[0]["percent"], 0.0)
        self.assertAlmostEqual(rows[0]["gap_to_target"], result["gap_to_target"])
        self.assertAlmostEqual(rows[0]["extra_gap"], 0)
        self.assertAlmostEqual(rows[2]["direct_costs"], 600)
        self.assertAlmostEqual(rows[2]["extra_gap"], -120)

    def test_target_rate_ladder_reprices_the_same_job(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        rows = target_rate_ladder(quote, calculate(quote))
        self.assertEqual([row["hourly_rate"] for row in rows], [50.0, 75.0, 100.0, 125.0])
        self.assertAlmostEqual(rows[1]["target_price"], 24 * 75 + 480)
        self.assertAlmostEqual(rows[1]["difference_from_quote"], 24 * 75 + 480 - 2400)

    def test_survives_overrun_percent_is_the_last_listed_overrun_still_at_target(self) -> None:
        # 24h at 75 = 1800 against a 2400 quote with no direct costs: still at
        # target at +25% (2250) but not at +50% (2700).
        quote = load_quote({"price": 2400, "delivery_hours": 24, "target_hourly_rate": 75})
        self.assertEqual(survives_overrun_percent(quote, calculate(quote)), 25.0)

    def test_survives_overrun_percent_is_none_when_the_quote_already_misses_target(self) -> None:
        # Running long cannot rescue a quote that is below target at planned
        # hours, so the column is blank rather than 0 — 0 would read as
        # "survives the planned case", which is the opposite of true here.
        quote = load_quote({"price": 1000, "delivery_hours": 24, "target_hourly_rate": 75})
        self.assertIsNone(survives_overrun_percent(quote, calculate(quote)))

    def test_survives_overrun_percent_is_zero_when_only_planned_hours_hold(self) -> None:
        quote = load_quote({"price": 1810, "delivery_hours": 24, "target_hourly_rate": 75})
        self.assertEqual(survives_overrun_percent(quote, calculate(quote)), 0.0)

    def test_json_report_carries_every_browser_table(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "quote.json"
            path.write_text(json.dumps({"price": 2400, "delivery_hours": 24, "target_hourly_rate": 75}), encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 0)
            report = json.loads(output.getvalue())
            for key in ("overrun_scenarios", "direct_cost_spikes", "discount_asks", "target_rate_ladder", "billing_models"):
                self.assertIn(key, report)
            self.assertEqual(report["survives_overrun_percent"], 25.0)
            self.assertIn("not a forecast", report["disclaimer"])

    def test_batch_json_report_carries_the_tables_per_quote(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "a.json").write_text(json.dumps({"price": 2400, "delivery_hours": 24, "target_hourly_rate": 75}), encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(folder), "--batch", "--format", "json"]), 0)
            report = json.loads(output.getvalue())
            self.assertEqual(report["reports"][0]["file"], "a.json")
            self.assertIn("overrun_scenarios", report["reports"][0])
            self.assertEqual(report["reports"][0]["survives_overrun_percent"], 25.0)

    def test_batch_csv_ranks_quotes_by_the_overrun_they_survive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "healthy.json").write_text(json.dumps({"price": 2400, "delivery_hours": 24, "target_hourly_rate": 75}), encoding="utf-8")
            (folder / "already-under.json").write_text(json.dumps({"price": 1000, "delivery_hours": 24, "target_hourly_rate": 75}), encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                batch_csv_report(load_reports(folder))
            rows = output.getvalue().splitlines()
            self.assertEqual(rows[0].split(",")[-2:], ["gap_to_target_at_plus_25_percent_hours", "survives_overrun_percent"])
            under, healthy = (row.split(",") for row in rows[1:])
            self.assertEqual(under[0], "already-under.json")
            self.assertEqual(under[-1], "")
            self.assertEqual(healthy[-1], "25")

    def test_sensitivity_payload_matches_the_individual_builders(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "overhead": 180, "target_hourly_rate": 75})
        result = calculate(quote)
        payload = sensitivity(quote, result)
        self.assertEqual(payload["overrun_scenarios"], overrun_scenarios(quote, result))
        self.assertEqual(payload["direct_cost_spikes"], direct_cost_spike_scenarios(quote, result))
        self.assertEqual(payload["discount_asks"], discount_ask_scenarios(quote, result))
        self.assertEqual(payload["target_rate_ladder"], target_rate_ladder(quote, result))
        self.assertEqual(payload["billing_models"], compare_billing_models(quote, result))

    def test_markdown_report_shows_the_what_if_tables_with_their_limits(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "target_hourly_rate": 75})
        report = markdown(quote, calculate(quote))
        for heading in ("## If the work runs long", "## If direct costs rise before work starts", "## If the client asks for a discount", "## The same job at other hourly targets"):
            self.assertIn(heading, report)
        self.assertIn("not a forecast of delivery time", report)

    @unittest.skipUnless(shutil.which("node"), "node is not available in this environment")
    def test_cli_tables_match_site_calc_mjs_exactly(self) -> None:
        """Run both implementations on one quote and compare every number.

        The mirrored assertions elsewhere in this file pin each table's
        arithmetic, but only this test fails when someone changes one surface
        and not the other — which is how the CLI came to be missing four of
        these tables in the first place.
        """
        inputs = {"currency": "USD", "price": 2400, "delivery_hours": 24, "admin_hours": 5, "revision_hours": 6, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75}
        script = (
            "import { loadQuote, calculate, overrunScenarios, directCostSpikeScenarios, discountAskScenarios, targetRateLadder, compareBillingModels } from './calc.mjs';\n"
            f"const q = loadQuote({json.dumps(inputs)}); const r = calculate(q);\n"
            "console.log(JSON.stringify({ overrun_scenarios: overrunScenarios(q, r), direct_cost_spikes: directCostSpikeScenarios(q, r), discount_asks: discountAskScenarios(q, r), target_rate_ladder: targetRateLadder(q, r), billing_models: compareBillingModels(q, r) }));\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            runner = SITE / f"parity-{Path(directory).name}.mjs"
            runner.write_text(script, encoding="utf-8")
            try:
                completed = subprocess.run(["node", str(runner)], capture_output=True, text=True, check=True)
            finally:
                runner.unlink()
        browser = json.loads(completed.stdout)
        quote = load_quote(inputs)
        cli = sensitivity(quote, calculate(quote))
        self.assertEqual(sorted(browser), sorted(cli))
        for table in browser:
            self.assertEqual(len(browser[table]), len(cli[table]), table)
            for index, (left, right) in enumerate(zip(browser[table], cli[table])):
                self.assertEqual(sorted(left), sorted(right), f"{table}[{index}] fields")
                for field, value in left.items():
                    if value is None or right[field] is None:
                        self.assertEqual(value, right[field], f"{table}[{index}].{field}")
                    else:
                        self.assertAlmostEqual(float(value), float(right[field]), places=9, msg=f"{table}[{index}].{field}")

    def test_markdown_discount_table_blanks_hours_to_cut_below_direct_costs(self) -> None:
        # A discount that no longer covers direct costs cannot be absorbed by
        # cutting scope, so the cell must be blank rather than a number that
        # would read as an achievable amount of scope to remove.
        quote = load_quote({"price": 1000, "delivery_hours": 10, "overhead": 950, "target_hourly_rate": 100})
        report = markdown(quote, calculate(quote))
        discount_rows = [line for line in report.splitlines() if line.startswith("| -")]
        self.assertTrue(discount_rows)
        self.assertTrue(any(row.rstrip().endswith("| — |") for row in discount_rows))
