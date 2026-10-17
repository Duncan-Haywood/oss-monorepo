import pathlib
import sys
import unittest

here = pathlib.Path(__file__).resolve()
for d in ("selfrep-spares", "selfrep-repair", "selfrep-growth"):
    sys.path.insert(0, str(here.parents[2] / d / "src"))
from selfrep_growth.params import printer_copy
from selfrep_spares.spares import LIFE_H, breakdown_rate, mean_life_h, spare_cost_share, spare_cost_split, wear_parts

V = printer_copy()[1]


class Spares(unittest.TestCase):
    def test_every_wear_part_is_in_the_bom(self):
        self.assertEqual({p.name for p, _ in wear_parts()}, set(LIFE_H))

    def test_breakdown_shares_sum_to_one(self):
        self.assertAlmostEqual(sum(s for _, s, _, _ in spare_cost_split("printer", V)), 1.0)

    def test_life_scale_scales_mean_life(self):
        self.assertAlmostEqual(mean_life_h(life_scale=2.0), 2 * mean_life_h())
        self.assertAlmostEqual(breakdown_rate() * mean_life_h(), 1.0)

    def test_bigger_shop_never_raises_spare_cost(self):
        a = spare_cost_share("printer", V)
        b = spare_cost_share("printer+cnc+laser", V)
        self.assertLessEqual(b, a)

    def test_printable_swap_lowers_cost_share(self):
        base = spare_cost_share("printer", V)
        swapped = spare_cost_share("printer", V, swap={"LM8UU linear bearing": (0.0, 1.0)})
        self.assertLess(swapped, base)

    def test_share_is_a_fraction(self):
        c = spare_cost_share("printer", V)
        self.assertTrue(0 < c < 1)

    def test_free_everything_costs_nothing(self):
        swap = {n: (0.0, 1.0) for n in LIFE_H}
        self.assertEqual(spare_cost_share("printer", V, swap=swap), 0.0)


if __name__ == "__main__":
    unittest.main()
