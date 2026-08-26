import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from src.quote_margin import batch_csv_report, billing_model_note, billing_model_summary, calculate, compare_billing_models, csv_report, discount_ask_scenarios, load_quote, load_reports, main


class QuoteMarginTests(unittest.TestCase):
    def test_calculates_hidden_time_and_target_price(self) -> None:
        quote = load_quote({"price": 2400, "delivery_hours": 24, "admin_hours": 5, "revision_hours": 6, "overhead": 180, "subcontractor_cost": 300, "target_hourly_rate": 75})
        result = calculate(quote)
        self.assertEqual(result["total_hours"], 35)
        self.assertAlmostEqual(result["effective_hourly_rate"], 54.8571428, places=6)
        self.assertEqual(result["target_price"], 3105)
        self.assertEqual(result["gap_to_target"], -705)

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
        self.assertEqual(calculate(quote)["discount_room"], 0)

    def test_reports_discount_room_above_target(self) -> None:
        quote = load_quote({"price": 4000, "delivery_hours": 10, "target_hourly_rate": 100})
        self.assertEqual(calculate(quote)["discount_room"], 3000)

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
                "effective_hourly_rate,100.00,EUR/hour",
                "target_price,1800.00,EUR",
                "gap_to_target,600.00,EUR",
                "cost_coverage,2400.00,EUR",
                "discount_room,600.00,EUR",
                "hourly_bill_at_planned_hours,1800.00,EUR",
                "hourly_minus_fixed_at_planned_hours,-600.00,EUR",
            ],
        )

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
