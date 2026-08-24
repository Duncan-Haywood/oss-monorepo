import unittest
from contextlib import redirect_stdout
from io import StringIO

from src.quote_margin import calculate, csv_report, load_quote


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

    def test_csv_report_is_spreadsheet_ready_and_keeps_units(self) -> None:
        quote = load_quote({"currency": "EUR", "price": 1000, "delivery_hours": 10, "target_hourly_rate": 100})
        output = StringIO()
        with redirect_stdout(output):
            csv_report(quote, calculate(quote))
        self.assertIn("quoted_price,1000.00,EUR", output.getvalue())
        self.assertIn("effective_hourly_rate,100.00,EUR/hour", output.getvalue())

    def test_rejects_invalid_currency_label(self) -> None:
        with self.assertRaises(ValueError):
            load_quote({"currency": "", "price": 1, "delivery_hours": 1, "target_hourly_rate": 1})

    def test_rejects_non_finite_numbers(self) -> None:
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.assertRaises(ValueError):
                load_quote({"price": value, "delivery_hours": 1, "target_hourly_rate": 1})

    def test_reports_price_left_after_direct_costs(self) -> None:
        quote = load_quote({"price": 1000, "delivery_hours": 10, "overhead": 125, "subcontractor_cost": 75, "target_hourly_rate": 80})
        self.assertEqual(calculate(quote)["cost_coverage"], 800)
