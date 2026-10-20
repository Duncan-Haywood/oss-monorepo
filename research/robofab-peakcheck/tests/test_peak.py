import unittest
from robofab_peakcheck import peak, trap
from robofab_peakcheck.model import Arm

ARM = Arm(0.12, 0.12, 0.12, 0.12, 0.2)
QA, QB = (0.3, 0.8), (1.0, 0.2)


class T(unittest.TestCase):
    def test_utilisation_matches_move(self):
        f, T_ = 0.1, 0.5
        r = trap.move(ARM, QA, QB, T_, f, n=200, mass=0.1, ramp_samples=20)
        s = peak.utilisation(ARM, QA, QB, T_, f, 5.0, 0.1, None, trap.sample_points(200, f, 20))
        self.assertAlmostEqual(max(u for _, u in s), max(r["tau1"], r["tau2"]) / 5.0, places=9)
        # the corner samples can only raise it
        self.assertGreaterEqual(peak.peak_util(ARM, QA, QB, T_, f, 5.0, 0.1, None, 200, 20)[0], max(u for _, u in s))

    def test_jaw_cap_is_included(self):
        r = trap.move(ARM, QA, QB, 0.5, 0.1, n=200, mass=0.1)
        u, _ = peak.peak_util(ARM, QA, QB, 0.5, 0.1, 1e9, 0.1, r["force"] / 3, 200, 0)
        self.assertAlmostEqual(u, 3.0, places=6)

    def test_denser_check_never_lowers_the_peak(self):
        a = peak.peak_util(ARM, QA, QB, 0.4, 0.05, 5.0, 0.1, None, 200, 20)[0]
        b = peak.peak_util(ARM, QA, QB, 0.4, 0.05, 5.0, 0.1, None, 4000, 200)[0]
        self.assertGreaterEqual(b, a - 1e-12)

    def test_missed_bound_of_a_line_is_zero_for_zero_slope_and_scales_with_gap(self):
        flat = [(i / 10, 1.0) for i in range(11)]
        self.assertEqual(peak.missed_bound(flat), 0.0)
        ramp = [(i / 10, 2 * i / 10) for i in range(11)]
        self.assertAlmostEqual(peak.missed_bound(ramp), 2 * 0.1 / 2)

    def test_corners_are_sampled_from_both_sides(self):
        xs = peak.dense_points(10, 0.1, 0)
        self.assertTrue(any(abs(x - 0.1) < 1e-8 and x < 0.1 for x in xs) and any(abs(x - 0.1) < 1e-8 and x > 0.1 for x in xs))

    def test_missed_bound_ignores_pairs_across_a_break(self):
        step = [(0.0, 0.0), (0.4, 0.0), (0.6, 5.0), (1.0, 5.0)]
        self.assertGreater(peak.missed_bound(step), 1.0)
        self.assertEqual(peak.missed_bound(step, breaks=(0.5,)), 0.0)

    def test_missed_bound_ignores_float_duplicates(self):
        dup = [(0.0, 0.0), (0.5, 1.0), (0.5 + 1e-16, 1.0 + 1e-12), (1.0, 1.0)]
        self.assertLess(peak.missed_bound(dup), 1.0)

    def test_missed_bound_break_exactly_on_a_sample(self):
        s = [(0.0, 0.0), (0.4, 0.0), (0.5 - 1e-9, 0.0), (0.5, 5.0), (0.5 + 1e-9, 5.0), (1.0, 5.0)]
        self.assertEqual(peak.missed_bound(s, breaks=(0.5,)), 0.0)

    def test_dense_duration_is_not_shorter_than_coarse(self):
        f = 0.05
        t0 = trap.min_time_trap(ARM, QA, QB, 5.0, 0.1, 1e9, f, ramp_samples=40)
        td = peak.min_time_dense(ARM, QA, QB, 5.0, 0.1, None, f, t0, 2000, 400)
        self.assertIsNotNone(td)
        self.assertGreaterEqual(td, 0.9 * t0)
        self.assertLessEqual(td, 1.05 * t0)
        self.assertLessEqual(peak.peak_util(ARM, QA, QB, td, f, 5.0, 0.1, None, 2000, 400)[0], 1.0 + 1e-9)

    def test_infeasible_returns_none(self):
        self.assertIsNone(peak.min_time_dense(ARM, QA, QB, 0.01, 0.1, None, 0.1, 0.5, 200, 20))


if __name__ == "__main__":
    unittest.main()
