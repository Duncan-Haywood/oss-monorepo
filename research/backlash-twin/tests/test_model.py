import math
import unittest

from backlash_twin.model import (play, run_loop, twin_radius, describing_function, fourier_df, predict_cycle,
                                 measured_cycle, G)


class T(unittest.TestCase):
    def test_play_operator(self):
        self.assertEqual(play(0.0, 0.5, 0.2), 0.3)     # pushed up by the lower edge
        self.assertEqual(play(0.0, -0.5, 0.2), -0.3)
        self.assertEqual(play(0.1, 0.0, 0.2), 0.1)     # inside the gap: load does not move
        self.assertEqual(play(1.0, 0.0, 0.0), 0.0)     # no gap: y = m

    def test_twin_converges_when_h_zero(self):
        ms, ys = run_loop(0.5, 0.1, 0.0, 10.0, 400)
        self.assertLess(abs(ms[-1]), 1e-9)
        self.assertLess(twin_radius(0.5, 0.1), 1)

    def test_twin_radius_matches_simulation(self):
        rho = twin_radius(0.3, 0.05)
        ms, _ = run_loop(0.3, 0.05, 0.0, 1.0, 600)
        self.assertLess(rho, 1)
        self.assertLess(abs(ms[-1]), 1e-6)

    def test_df_matches_fourier(self):
        for A in (1.3, 2.0, 5.0):
            self.assertLess(abs(describing_function(A, 1.0) - fourier_df(A, 1.0)), 1e-5)
        self.assertEqual(describing_function(0.9, 1.0), 0j)

    def test_df_limits(self):
        self.assertAlmostEqual(abs(describing_function(1e4, 1.0)), 1.0, places=3)
        self.assertLess(describing_function(2.0, 1.0).imag, 0)  # always a lag

    def test_real_loop_hunts_and_scales_with_h(self):
        a1, _ = measured_cycle(run_loop(0.5, 0.1, 1.0, 10.0, 30000)[0][-3000:])
        a2, _ = measured_cycle(run_loop(0.5, 0.1, 0.01, 0.1, 30000)[0][-3000:])
        self.assertGreater(a1, 1.0)
        self.assertAlmostEqual(a1, a2 / 0.01, places=6)

    def test_harmonic_balance_close_to_simulation(self):
        A, w, r = predict_cycle(0.5, 0.1)
        self.assertLess(r, 1e-6)
        a, _ = measured_cycle(run_loop(0.5, 0.1, 1.0, 10.0, 30000)[0][-3000:])
        self.assertLess(abs(A - a) / a, 0.15)
        self.assertAlmostEqual(abs(1 + describing_function(A, 1.0) * G(w, 0.5, 0.1)), 0, places=6)

    def test_bistable_case(self):
        soft = measured_cycle(run_loop(0.5, 0.05, 1.0, 3.0, 60000)[0][-3000:])[0]
        hard = measured_cycle(run_loop(0.5, 0.05, 1.0, 10.0, 60000)[0][-3000:])[0]
        self.assertGreater(soft, 1.0)
        self.assertLess(hard, 1e-3)


if __name__ == "__main__":
    unittest.main()
