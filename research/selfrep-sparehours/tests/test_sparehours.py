import pathlib
import sys
import unittest

here = pathlib.Path(__file__).resolve()
sys.path.insert(0, str(here.parents[1] / "src"))
from selfrep_sparehours.sparehours import bushing_rates, mean_repair_h
from selfrep_spares.spares import breakdown_rate


class SpareHours(unittest.TestCase):
    def test_k1_matches_unswapped_machine(self):
        rate, share = bushing_rates(1.0)
        self.assertAlmostEqual(rate, breakdown_rate())
        self.assertTrue(0 < share < 1)

    def test_shorter_bushing_life_raises_rate_and_share(self):
        r1, s1 = bushing_rates(1.0)
        r2, s2 = bushing_rates(0.5)
        self.assertGreater(r2, r1)
        self.assertGreater(s2, s1)

    def test_mean_repair_hours(self):
        self.assertEqual(mean_repair_h(5.0, 0.0, 0.7), 5.0)
        self.assertAlmostEqual(mean_repair_h(5.0, 10.0, 0.5), 10.0)


if __name__ == "__main__":
    unittest.main()
