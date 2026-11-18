"""unittest pins on the published tables (research CI runs unittest discover).

Added after quality audit 2026-11-13-garment-learning.json: three seeded bugs in
model.py survived the pytest suite, which pins no number from results.txt.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_learning.model import average_cost_over, units_to_reach  # noqa: E402

F = 76.0  # experienced minutes per coat (sewing 51 + cutting 25)


class PinnedResults(unittest.TestCase):
    def test_table_a_coats_to_2x(self):
        # closed form n = ceil((k/2)^(1/-log2 r)), recomputed independently in the audit
        for k, r, n in [(4, 0.85, 20), (4, 0.90, 96), (8, 0.85, 370), (8, 0.90, 9138)]:
            self.assertEqual(units_to_reach(2 * F, k * F, r, floor=F), n)

    def test_table_d_factory_run(self):
        for n, mean in [(1, 27.636), (10, 22.094), (200, 14.944), (1000, 14.043)]:
            self.assertAlmostEqual(average_cost_over(n, 2 * F, 0.90, 6, floor=F, efficiency=0.55), mean, places=3)
        steady = F / 60 * 6 / 0.55
        self.assertAlmostEqual(average_cost_over(200, 2 * F, 0.90, 6, floor=F, efficiency=0.55) / steady, 1.0815, places=3)

    def test_floor_itself_is_reachable(self):
        self.assertEqual(units_to_reach(F, 2 * F, 0.90, floor=F) is not None, True)


if __name__ == "__main__":
    unittest.main()
