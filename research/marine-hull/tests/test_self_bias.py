import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_bias_sweep as bs  # noqa: E402
import run_self_bias as sb  # noqa: E402


class SelfBiasTests(unittest.TestCase):
    def test_tau_table_matches_6zv_reading(self):
        self.assertEqual([sb.tau_of(e) for e in (0.96, 0.984, 0.985, 1.0, 1.0149, 1.015, 1.024, 1.025, 1.05)],
                         [60, 60, 30, 30, 30, 20, 20, 10, 10])

    def test_ratio_is_one_with_a_perfect_climatology_and_tracks_a_scale(self):
        hc = [100.0 + (d % 50) for d in range(365)]
        for n in sb.WINDOWS:
            self.assertTrue(all(abs(r - 1.0) < 1e-12 for r in sb.ratios(hc, hc, n)))
            r = sb.ratios([0.9 * x for x in hc], hc, n)
            self.assertEqual(r[0], 1.0)  # day 0: prior only
            self.assertLess(abs(r[-1] - (0.9 * n + sb.PRIOR_DAYS) / (n + sb.PRIOR_DAYS)), 0.01)

    def test_ratio_uses_only_past_days(self):
        hc = [100.0] * 100
        h = [100.0] * 50 + [0.0] * 50
        r = sb.ratios(h, hc, 30)
        self.assertEqual(r[50], 1.0)
        self.assertLess(r[51], 1.0)

    def test_fixed_rules_reproduce_6zv(self):
        for key in ((5000.0, "A+40", 2016, 1.0), (20000.0, "P+10", 2022, 0.98)):
            _, o, _ = sb.score(key)
            _, o2, _ = bs.score(key)
            c = key[0]
            self.assertEqual(o["PS"][:2], o2[bs.PS[c]][:2])
            self.assertEqual(o["PSS"][:2], o2[bs.PSS[c]][:2])
            self.assertEqual(o["B"][:2], o2["B"][:2])

    def test_oracle_uses_true_eff_and_counts_every_day(self):
        _, o, (s_eff, n) = sb.score((2500.0, "A+40", 2023, 1.02))
        tau = sb.tau_of(1.02 / sb.REALISED["T"])
        self.assertEqual(o["OR"][2][tau], n)
        self.assertEqual(sum(o["AT_60"][2].values()), n)


if __name__ == "__main__":
    unittest.main()
