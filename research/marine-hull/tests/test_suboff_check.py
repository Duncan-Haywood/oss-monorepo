import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))
import run_suboff_check as r  # noqa: E402
from marine_hull.hull import cf_ittc57  # noqa: E402


class SuboffTests(unittest.TestCase):
    def test_implied_k_round_trips(self):
        u = 5.0
        rt = 0.5 * r.RHO * u * u * r.S8 * 1.25 * cf_ittc57(u * r.L / 1e-6)
        self.assertAlmostEqual(r.implied_k(rt, u), 1.25, places=9)

    def test_data_loaded(self):
        rows = r.load()
        self.assertEqual(sum(1 for x in rows if x['config'] == '8'), 6)
        self.assertEqual(sum(1 for x in rows if x['config'] == '1'), 6)

    def test_bare_hull_share(self):
        for _, s in r.share(r.load()):
            self.assertTrue(0.80 < s < 0.90)

    def test_above_5ms_k_eff_steady(self):
        ks = [r.implied_k(float(x['resistance_N']), float(x['speed_ms'])) for x in r.load()
              if x['config'] == '8' and float(x['speed_ms']) > 5]
        self.assertLess((max(ks) - min(ks)) / min(ks), 0.02)


if __name__ == '__main__':
    unittest.main()
