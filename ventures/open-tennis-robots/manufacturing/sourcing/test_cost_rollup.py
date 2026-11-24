"""python3 -m unittest test_cost_rollup  (stdlib only)."""
import unittest

import cost_rollup as cr


class Rollup(unittest.TestCase):
    def test_committed_csv_passes_check(self):
        self.assertEqual(cr.check(cr.load()), [])

    def test_break_and_pack_and_moq(self):
        row = {"qty_per_unit": "18", "pack": "9", "moq": "1", "p1_qty": "1", "p1_usd": "10", "p2_qty": "100", "p2_usd": "8"}
        self.assertEqual(cr.line_cost(row, 10), 20 * 10)   # 20 packs, below the 100 break
        self.assertEqual(cr.line_cost(row, 100), 200 * 8)  # 200 packs at the 100 break
        moq = {"qty_per_unit": "2", "pack": "1", "moq": "25", "p1_qty": "25", "p1_usd": "4"}
        self.assertEqual(cr.line_cost(moq, 10), 25 * 4)    # 20 needed, MOQ 25 bought

    def test_unpriced_rows_are_gaps_not_zero(self):
        res = cr.rollup(cr.load())
        self.assertIn("laser_parts", res["gaps"])
        self.assertGreater(res["per_unit"][10], 0)

    def test_priced_row_without_url_fails(self):
        self.assertTrue(cr.check([{"bom_item": "x", "p1_qty": "1", "p1_usd": "1", "url": "", "checked": ""}]))


if __name__ == "__main__":
    unittest.main()
